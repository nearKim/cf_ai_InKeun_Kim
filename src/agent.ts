import { Agent, type Connection, type ConnectionContext } from '@cloudflare/agents'
import { Exit } from 'effect'
import type { Env, SessionState, ConnectionState } from './types'
import { log } from './logger'
import { precondition } from './contracts'
import {
  createStateService,
  createInitialState,
  createMessageQueueService,
  createAuthenticationService,
  type StateService,
  type MessageQueueService,
  type AuthenticationService,
} from './services'
import {
  parseEnvelope,
  serializeEnvelope,
  MessageEnvelopeParseError,
  type MessageEnvelope,
} from './validation'
import {
  createStatusMessage,
  serializeStatusMessage,
  serializeErrorMessage,
  queueFullError,
  invalidMessageError,
} from './messages/index'
import { extractToken, createEffectRunner, type EffectRunner } from './utils'

const PROTOCOL_VERSION = '1'

type WSMessage = string | ArrayBuffer

export class SessionAgent extends Agent<Env, SessionState> {
  private stateService!: StateService
  private queueService!: MessageQueueService
  private authService!: AuthenticationService
  private effectRunner!: EffectRunner
  private homeServerWebSocket: WebSocket | null = null
  private reconnectAttempts = 0
  private homeServerUrl: string | null = null
  private clientConnections: Map<string, Connection<ConnectionState>> = new Map()

  initialState: SessionState = createInitialState()

  async onStart(): Promise<void> {
    this.effectRunner = createEffectRunner()

    this.stateService = createStateService(
      () => this.state ?? this.initialState,
      (state) => this.setState(state)
    )

    this.queueService = createMessageQueueService(
      (strings, ...values) => this.sql(strings, ...values)
    )

    this.authService = createAuthenticationService(
      this.env.AUTH_SECRET_KEY,
      this.env.ALLOWED_HOME_SERVER_PATTERN ?? '^wss://.*\\.nearkim\\.dev$'
    )

    await this.effectRunner.runPromise(this.queueService.ensureSchema())

    const storedUrl = await this.ctx.storage.get<string>('homeServerUrl')
    if (storedUrl && this.stateService.isActive()) {
      this.homeServerUrl = storedUrl
      this.connectToHomeServer()
    }

    await this.syncQueueDepth()
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/close') && request.method === 'POST') {
      return this.handleCloseRequest(request)
    }

    if (url.pathname.endsWith('/health')) {
      return Response.json({
        status: 'ok',
        state: this.stateService.getState(),
        connections: this.clientConnections.size,
      })
    }

    return new Response('Use WebSocket to connect', { status: 426 })
  }

  private async handleCloseRequest(request: Request): Promise<Response> {
    const token = extractToken(request)
    const result = await this.effectRunner.runExit(
      this.authService.validateToken(token)
    )

    if (Exit.isFailure(result)) {
      return new Response('Unauthorized', { status: 401 })
    }

    await this.effectRunner.runPromise(
      this.stateService.update({ type: 'SET_STATUS', status: 'Closed' })
    )

    for (const conn of this.clientConnections.values()) {
      conn.close(1000, 'Session closed')
    }
    this.clientConnections.clear()

    this.homeServerWebSocket?.close(1000, 'Session closed')
    this.homeServerWebSocket = null

    await this.effectRunner.runPromise(this.queueService.clear())
    await this.ctx.storage.deleteAll()

    return Response.json({ status: 'closed' })
  }

  async onConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext
  ): Promise<void> {
    const url = new URL(ctx.request.url)

    const clientVersion = ctx.request.headers.get('X-Protocol-Version') ?? '1'
    if (clientVersion !== PROTOCOL_VERSION) {
      connection.close(4004, `Unsupported protocol version. Server: ${PROTOCOL_VERSION}`)
      return
    }

    const token = extractToken(ctx.request)
    const urlSessionId = url.pathname.split('/').pop() ?? ''

    const authResult = await this.effectRunner.runExit(
      this.authService.validateSessionAccess(token, urlSessionId)
    )

    if (Exit.isFailure(authResult)) {
      const cause = authResult.cause
      if ('_tag' in cause && cause._tag === 'Fail') {
        const error = cause.error
        if ('reason' in error && error.reason === 'session_mismatch') {
          connection.close(4003, 'Session ID mismatch')
          return
        }
      }
      connection.close(4001, 'Invalid token')
      return
    }

    const payload = authResult.value

    const connectionId = crypto.randomUUID()
    connection.accept()
    connection.setState({
      connectionId,
      authenticatedAt: Date.now(),
      userId: payload.userId,
    })

    this.clientConnections.set(connectionId, connection)
    log('info', 'client_connected', {
      sessionId: payload.sessionId,
      userId: payload.userId,
      connectionId,
    })

    if (!this.homeServerUrl) {
      this.homeServerUrl = payload.homeServerUrl
      await this.ctx.storage.put('homeServerUrl', payload.homeServerUrl)
    }

    const state = this.stateService.getState()
    if (!state.sessionId) {
      await this.effectRunner.runPromise(
        this.stateService.update({ type: 'INITIALIZE', sessionId: payload.sessionId })
      )
    }

    if (this.stateService.isIdle()) {
      await this.effectRunner.runPromise(
        this.stateService.update([
          { type: 'SET_STATUS', status: 'Active' },
          { type: 'TOUCH_ACTIVITY' },
        ])
      )
    } else {
      await this.effectRunner.runPromise(
        this.stateService.update({ type: 'TOUCH_ACTIVITY' })
      )
    }

    if (!this.homeServerWebSocket) {
      this.connectToHomeServer()
    }

    const finalState = this.stateService.getState()
    connection.send(
      serializeStatusMessage(
        createStatusMessage({
          protocolVersion: PROTOCOL_VERSION,
          homeServer: finalState.homeServer,
          queueDepth: finalState.queueDepth,
          sessionState: finalState.status,
        })
      )
    )
  }

  async onMessage(
    connection: Connection<ConnectionState>,
    message: WSMessage
  ): Promise<void> {
    if (typeof message !== 'string') {
      connection.send(serializeErrorMessage(invalidMessageError('Binary messages not supported')))
      return
    }

    try {
      const parsed = JSON.parse(message)
      if (parsed.type === 'ping') {
        connection.send(JSON.stringify({ type: 'pong' }))
        return
      }
      if (parsed.type === 'pong') {
        return
      }
    } catch {
    }

    const parseResult = await this.effectRunner.runExit(parseEnvelope(message))
    if (Exit.isFailure(parseResult)) {
      const cause = parseResult.cause
      let reason = 'Invalid message envelope'
      if ('_tag' in cause && cause._tag === 'Fail') {
        const error = cause.error
        if (error instanceof MessageEnvelopeParseError) {
          reason = `${error.reason}: ${error.message}`
        }
      }
      connection.send(serializeErrorMessage(invalidMessageError(reason)))
      return
    }

    const envelope = parseResult.value

    await this.effectRunner.runPromise(
      this.stateService.update({ type: 'TOUCH_ACTIVITY' })
    )

    await this.routeMessage(envelope, connection)
  }

  async onClose(
    connection: Connection<ConnectionState>,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const connectionId = connection.state?.connectionId
    const sessionId = this.stateService.getState().sessionId

    if (connectionId) {
      this.clientConnections.delete(connectionId)
      log('info', 'client_disconnected', { sessionId, connectionId, code, reason })
    }

    if (this.clientConnections.size === 0) {
      await this.schedule(
        new Date(Date.now() + 6 * 60 * 60 * 1000),
        'checkIdleTimeout',
        {}
      )
    }
  }

  async onError(
    _connection: Connection<ConnectionState>,
    error: unknown
  ): Promise<void> {
    console.error('Client connection error:', error)
  }

  private connectToHomeServer(): void {
    precondition(this.homeServerUrl !== null, 'homeServerUrl must be set before connecting')

    this.effectRunner.runPromise(
      this.stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'connecting' })
    )

    try {
      const ws = new WebSocket(this.homeServerUrl)

      ws.addEventListener('open', () => {
        this.homeServerWebSocket = ws
        this.reconnectAttempts = 0
        this.effectRunner.runPromise(
          this.stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'online' })
        )
        log('info', 'home_server_connected', {
          sessionId: this.stateService.getState().sessionId,
          url: this.homeServerUrl,
        })
        this.flushMessageQueue()
      })

      ws.addEventListener('message', (event) => {
        this.broadcastToClients(event.data as string)
      })

      ws.addEventListener('close', () => {
        this.homeServerWebSocket = null
        this.effectRunner.runPromise(
          this.stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'offline' })
        )
        this.scheduleReconnect()
      })

      ws.addEventListener('error', () => {
        this.homeServerWebSocket = null
        this.effectRunner.runPromise(
          this.stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'offline' })
        )
        this.scheduleReconnect()
      })
    } catch (error) {
      console.error('Failed to connect to home server:', error)
      this.effectRunner.runPromise(
        this.stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'offline' })
      )
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.stateService.isActive()) return

    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts))
    this.reconnectAttempts++
    log('warn', 'home_server_reconnecting', {
      sessionId: this.stateService.getState().sessionId,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    })
    this.schedule(delay / 1000, 'attemptReconnect', {})
  }

  async attemptReconnect(): Promise<void> {
    if (!this.homeServerWebSocket && this.stateService.isActive()) {
      this.connectToHomeServer()
    }
  }

  private async routeMessage(
    envelope: MessageEnvelope,
    sender: Connection<ConnectionState>
  ): Promise<void> {
    if (this.homeServerWebSocket) {
      try {
        this.homeServerWebSocket.send(serializeEnvelope(envelope))
      } catch {
        await this.queueMessage(envelope, sender)
      }
    } else {
      await this.queueMessage(envelope, sender)
    }
  }

  private async queueMessage(
    envelope: MessageEnvelope,
    sender: Connection<ConnectionState>
  ): Promise<void> {
    const limit = parseInt(this.env.MESSAGE_QUEUE_LIMIT ?? '100', 10)

    const result = await this.effectRunner.runExit(
      this.queueService.enqueue(envelope, limit)
    )

    if (Exit.isFailure(result)) {
      const cause = result.cause
      if ('_tag' in cause && cause._tag === 'Fail') {
        const error = cause.error
        if ('_tag' in error && error._tag === 'QueueFullError') {
          log('warn', 'queue_full', {
            sessionId: this.stateService.getState().sessionId,
            limit,
            count: error.currentCount,
          })
          sender.send(serializeErrorMessage(queueFullError(error.retryAfter)))
        }
      }
      return
    }

    await this.syncQueueDepth()
  }

  private async flushMessageQueue(): Promise<void> {
    if (!this.homeServerWebSocket) return

    const messagesResult = await this.effectRunner.runExit(this.queueService.getAll())
    if (Exit.isFailure(messagesResult)) return

    const messages = messagesResult.value
    let flushedCount = 0

    for (const msg of messages) {
      if (!this.homeServerWebSocket) break

      try {
        this.homeServerWebSocket.send(msg.envelopeJson)
        await this.effectRunner.runPromise(this.queueService.dequeue(msg.id))
        flushedCount++
      } catch {
        break
      }
    }

    if (flushedCount > 0) {
      await this.syncQueueDepth()
    }
  }

  private async syncQueueDepth(): Promise<void> {
    const countResult = await this.effectRunner.runExit(this.queueService.count())
    if (Exit.isFailure(countResult)) return

    const count = countResult.value
    const currentDepth = this.stateService.getState().queueDepth

    if (count !== currentDepth) {
      await this.effectRunner.runPromise(
        this.stateService.update({ type: 'SET_QUEUE_DEPTH', queueDepth: count })
      )
    }
  }

  async checkIdleTimeout(): Promise<void> {
    if (this.clientConnections.size === 0 && this.stateService.isActive()) {
      await this.effectRunner.runPromise(
        this.stateService.update({ type: 'SET_STATUS', status: 'Idle' })
      )

      if (this.homeServerWebSocket) {
        this.homeServerWebSocket.close(1000, 'Session idle')
        this.homeServerWebSocket = null
      }

      const state = this.stateService.getState()
      const expiresAt = state.createdAt + 7 * 24 * 60 * 60 * 1000
      await this.schedule(new Date(expiresAt), 'checkExpiration', {})
    }
  }

  async checkExpiration(): Promise<void> {
    if (this.stateService.isIdle()) {
      await this.effectRunner.runPromise(
        this.stateService.update({ type: 'SET_STATUS', status: 'Closed' })
      )
      await this.effectRunner.runPromise(this.queueService.clear())
      await this.ctx.storage.deleteAll()
    }
  }

  private broadcastToClients(message: string): void {
    for (const conn of this.clientConnections.values()) {
      try {
        conn.send(message)
      } catch {
      }
    }
  }
}
