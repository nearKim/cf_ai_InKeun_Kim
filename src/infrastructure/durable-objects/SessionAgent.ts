import { Agent, type Connection, type ConnectionContext } from '@cloudflare/agents'
import { Effect, Runtime, Exit } from 'effect'
import type { SessionState, ConnectionState } from '../../domain/aggregates/Session'
import * as MessageEnvelope from '../../domain/types/MessageEnvelope'
import * as StatusMessage from '../../domain/types/StatusMessage'
import * as ErrorMessage from '../../domain/types/ErrorMessage'
import * as MessageQueue from '../../domain/value-objects/MessageQueue'
import {
  createTokenValidationService,
  type TokenValidationService,
} from '../../application/services/TokenValidationService'

export interface Env {
  SESSIONS: DurableObjectNamespace
  AUTH_SECRET_KEY: string
  MESSAGE_QUEUE_LIMIT?: string
  ALLOWED_HOME_SERVER_PATTERN?: string
}

type WSMessage = string | ArrayBuffer

export class SessionAgent extends Agent<Env, SessionState> {
  private homeServerWebSocket: WebSocket | null = null
  private reconnectAttempts = 0
  private homeServerUrl: string | null = null
  private tokenService: TokenValidationService | null = null
  private runtime = Runtime.defaultRuntime
  private clientConnections: Map<string, Connection<ConnectionState>> = new Map()

  initialState: SessionState = {
    sessionId: '',
    status: 'Active',
    homeServer: 'offline',
    queueDepth: 0,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  }

  private getState(): SessionState {
    return this.state ?? this.initialState
  }

  async onStart(): Promise<void> {
    this.ensureSchema()

    this.tokenService = createTokenValidationService(
      this.env.AUTH_SECRET_KEY ?? 'dev-secret',
      this.env.ALLOWED_HOME_SERVER_PATTERN ?? '^wss://.*\\.nearkim\\.dev$'
    )

    const storedUrl = await this.ctx.storage.get<string>('homeServerUrl')
    const currentState = this.getState()
    if (storedUrl && currentState.status === 'Active') {
      this.homeServerUrl = storedUrl
      this.connectToHomeServer()
    }

    await this.updateQueueDepth()
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/health')) {
      return Response.json({
        status: 'ok',
        state: this.getState(),
        connections: this.clientConnections.size,
      })
    }

    return new Response('Use WebSocket to connect', { status: 426 })
  }

  async onConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext
  ): Promise<void> {
    const token = ctx.request.headers.get('Authorization')
    const result = await this.runEffect(this.tokenService!.validate(token))

    if (Exit.isFailure(result)) {
      connection.close(4001, 'Invalid token')
      return
    }

    const payload = result.value
    const connectionId = crypto.randomUUID()
    connection.accept()
    connection.setState({
      connectionId,
      authenticatedAt: Date.now(),
      userId: payload.userId,
    })

    this.clientConnections.set(connectionId, connection)

    if (!this.homeServerUrl) {
      this.homeServerUrl = payload.homeServerUrl
      await this.ctx.storage.put('homeServerUrl', payload.homeServerUrl)
    }

    const currentState = this.getState()

    if (!currentState.sessionId) {
      this.setState({
        ...currentState,
        sessionId: payload.sessionId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      })
    }

    const stateAfterInit = this.getState()
    if (stateAfterInit.status === 'Idle') {
      this.setState({ ...stateAfterInit, status: 'Active', lastActivityAt: Date.now() })
    } else {
      this.setState({ ...stateAfterInit, lastActivityAt: Date.now() })
    }

    if (!this.homeServerWebSocket) {
      this.connectToHomeServer()
    }

    const finalState = this.getState()
    connection.send(
      StatusMessage.serialize(
        StatusMessage.create({
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
      connection.send(ErrorMessage.serialize(ErrorMessage.invalidMessage('Binary messages not supported')))
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

    const parseResult = await this.runEffect(MessageEnvelope.parse(message))
    if (Exit.isFailure(parseResult)) {
      const error = parseResult.cause
      const reason = 'error' in error && error.error instanceof MessageEnvelope.MessageEnvelopeParseError
        ? `${error.error.reason}: ${error.error.message}`
        : 'Invalid message envelope'
      connection.send(ErrorMessage.serialize(ErrorMessage.invalidMessage(reason)))
      return
    }

    const envelope = parseResult.value
    const currentState = this.getState()
    this.setState({ ...currentState, lastActivityAt: Date.now() })

    await this.routeMessage(envelope, connection)
  }

  async onClose(
    connection: Connection<ConnectionState>,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const connectionId = connection.state?.connectionId
    if (connectionId) {
      this.clientConnections.delete(connectionId)
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
    connection: Connection<ConnectionState>,
    error: unknown
  ): Promise<void> {
    console.error('Client connection error:', error)
  }

  private connectToHomeServer(): void {
    if (!this.homeServerUrl) return

    const currentState = this.getState()
    this.setState({ ...currentState, homeServer: 'connecting' })

    try {
      const ws = new WebSocket(this.homeServerUrl)

      ws.addEventListener('open', () => {
        this.homeServerWebSocket = ws
        this.reconnectAttempts = 0
        const state = this.getState()
        this.setState({ ...state, homeServer: 'online' })
        this.flushMessageQueue()
      })

      ws.addEventListener('message', (event) => {
        this.broadcastToClients(event.data as string)
      })

      ws.addEventListener('close', () => {
        this.homeServerWebSocket = null
        const state = this.getState()
        this.setState({ ...state, homeServer: 'offline' })
        this.scheduleReconnect()
      })

      ws.addEventListener('error', () => {
        this.homeServerWebSocket = null
        const state = this.getState()
        this.setState({ ...state, homeServer: 'offline' })
        this.scheduleReconnect()
      })
    } catch (error) {
      console.error('Failed to connect to home server:', error)
      const state = this.getState()
      this.setState({ ...state, homeServer: 'offline' })
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    const currentState = this.getState()
    if (currentState.status !== 'Active') return

    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts))
    this.reconnectAttempts++
    this.schedule(delay / 1000, 'attemptReconnect', {})
  }

  async attemptReconnect(): Promise<void> {
    const currentState = this.getState()
    if (!this.homeServerWebSocket && currentState.status === 'Active') {
      this.connectToHomeServer()
    }
  }

  private async routeMessage(
    envelope: MessageEnvelope.MessageEnvelope,
    sender: Connection<ConnectionState>
  ): Promise<void> {
    if (this.homeServerWebSocket) {
      try {
        this.homeServerWebSocket.send(MessageEnvelope.serialize(envelope))
      } catch {
        await this.queueMessage(envelope, sender)
      }
    } else {
      await this.queueMessage(envelope, sender)
    }
  }

  private async queueMessage(
    envelope: MessageEnvelope.MessageEnvelope,
    sender: Connection<ConnectionState>
  ): Promise<void> {
    const limit = parseInt(this.env.MESSAGE_QUEUE_LIMIT ?? '100', 10)
    const rows = this.sql<{ count: number }>`SELECT COUNT(*) as count FROM message_queue`
    const count = rows[0]?.count ?? 0

    if (count >= limit) {
      sender.send(ErrorMessage.serialize(ErrorMessage.queueFull(60)))
      return
    }

    this.sql`
      INSERT INTO message_queue (id, envelope_json, queued_at)
      VALUES (${envelope.id}, ${MessageEnvelope.serialize(envelope)}, ${Date.now()})
    `

    const currentState = this.getState()
    this.setState({ ...currentState, queueDepth: count + 1 })
  }

  private async flushMessageQueue(): Promise<void> {
    if (!this.homeServerWebSocket) return

    const messages = this.sql<MessageQueue.MessageQueueRow>`
      SELECT id, envelope_json, queued_at FROM message_queue ORDER BY queued_at ASC
    `

    let flushedCount = 0
    for (const msg of messages) {
      if (!this.homeServerWebSocket) break

      try {
        this.homeServerWebSocket.send(msg.envelope_json)
        this.sql`DELETE FROM message_queue WHERE id = ${msg.id}`
        flushedCount++
      } catch {
        break
      }
    }

    if (flushedCount > 0) {
      await this.updateQueueDepth()
    }
  }

  private async updateQueueDepth(): Promise<void> {
    const rows = this.sql<{ count: number }>`SELECT COUNT(*) as count FROM message_queue`
    const count = rows[0]?.count ?? 0
    const currentState = this.getState()
    if (count !== currentState.queueDepth) {
      this.setState({ ...currentState, queueDepth: count })
    }
  }

  async checkIdleTimeout(): Promise<void> {
    const currentState = this.getState()
    if (this.clientConnections.size === 0 && currentState.status === 'Active') {
      this.setState({ ...currentState, status: 'Idle' })

      if (this.homeServerWebSocket) {
        this.homeServerWebSocket.close(1000, 'Session idle')
        this.homeServerWebSocket = null
      }

      const expiresAt = currentState.createdAt + 7 * 24 * 60 * 60 * 1000
      await this.schedule(new Date(expiresAt), 'checkExpiration', {})
    }
  }

  async checkExpiration(): Promise<void> {
    const currentState = this.getState()
    if (currentState.status === 'Idle') {
      this.setState({ ...currentState, status: 'Closed' })
      this.sql`DELETE FROM message_queue`
      await this.ctx.storage.deleteAll()
    }
  }

  private ensureSchema(): void {
    this.sql`
      CREATE TABLE IF NOT EXISTS message_queue (
        id TEXT PRIMARY KEY,
        envelope_json TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      )
    `
  }

  private broadcastToClients(message: string): void {
    for (const conn of this.clientConnections.values()) {
      try {
        conn.send(message)
      } catch {
      }
    }
  }

  private async runEffect<A, E>(
    effect: Effect.Effect<A, E>
  ): Promise<Exit.Exit<A, E>> {
    return Runtime.runPromiseExit(this.runtime)(effect)
  }
}
