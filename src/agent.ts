import { Agent, type Connection, type ConnectionContext } from '@cloudflare/agents'
import { Effect, Exit, Runtime, pipe, Stream } from 'effect'
import type { Env, SessionState, ConnectionState } from './types'
import {
  createInitialState,
  createSessionServices,
  validateAndAuthenticate,
  setupConnection,
  initializeSessionIfNeeded,
  activateIfIdle,
  connectHomeServerIfNeeded,
  sendStatusMessage,
  reconnectIfActiveWithStoredUrl,
  removeConnectionIfExists,
  scheduleIdleCheckIfEmpty,
  processWebSocketMessage,
  routeHttpRequest,
  transitionToIdleIfEmpty,
  authenticateAndCloseSession,
  type SessionServices,
} from './services'
import {
  ProtocolVersionError,
  AuthenticationError,
  HomeServerConnectionError,
  QueueOperationError,
} from './errors'

const PROTOCOL_VERSION = '1'

type ConnectionError =
  | ProtocolVersionError
  | AuthenticationError
  | HomeServerConnectionError
  | QueueOperationError

export class SessionAgent extends Agent<Env, SessionState> {
  private services!: SessionServices
  private runtime = Runtime.defaultRuntime

  initialState: SessionState = createInitialState()

  private run<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
    return Runtime.runPromise(this.runtime)(effect)
  }

  private runExit<A, E>(effect: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> {
    return Runtime.runPromiseExit(this.runtime)(effect)
  }

  /** Initializes services, subscribes to home server messages, and restores previous session. */
  async onStart(): Promise<void> {
    this.services = await this.run(
      createSessionServices(
        this.env,
        (strings, ...values) => this.sql(strings, ...values),
        () => this.state ?? this.initialState,
        (state) => this.setState(state),
        this.initialState
      )
    )

    await this.run(
        pipe(
            this.services.homeServer.messageStream(),
            Stream.runForEach((msg) => this.services.clients.broadcast(msg))
        )
    )

    const storedUrl = await this.ctx.storage.get<string>('homeServerUrl')
    const services = this.services

    await this.run(
      Effect.gen(function* () {
        yield* services.queue.ensureSchema()
        yield* reconnectIfActiveWithStoredUrl(storedUrl, services)
        yield* services.router.syncQueueDepth()
      })
    )
  }

  async onConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext
  ): Promise<void> {
    const result = await this.runExit(this.handleConnect(connection, ctx))
    if (Exit.isFailure(result)) {
      connection.close(4001, 'Connection failed')
    }
  }

  /**
   * Handles new WebSocket connection from client.
   *
   * Flow:
   * 1. Validate protocol version and JWT token
   * 2. Accept connection and register in client registry
   * 3. Persist home server URL for session restoration on DO restart
   * 4. Initialize session ID on first connection (subsequent connections reuse existing)
   * 5. Reactivate session if it was Idle (client reconnected after timeout)
   * 6. Connect to home server if not already connected (may already be connected from another client)
   * 7. Send current session status to client
   */
  private handleConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext
  ): Effect.Effect<void, ConnectionError> {
    const services = this.services
    const storage = this.ctx.storage

    return Effect.gen(function* () {
      const payload = yield* validateAndAuthenticate(
        ctx.request,
        services,
        PROTOCOL_VERSION
      )

      yield* setupConnection(connection, payload, services)
      yield* Effect.promise(() => storage.put('homeServerUrl', payload.homeServerUrl))
      yield* initializeSessionIfNeeded(payload, services)
      yield* activateIfIdle(services)
      yield* connectHomeServerIfNeeded(payload.homeServerUrl, services)
      yield* sendStatusMessage(connection, services, PROTOCOL_VERSION)
    })
  }

  async onMessage(
    connection: Connection<ConnectionState>,
    message: string | ArrayBuffer
  ): Promise<void> {
    await this.run(processWebSocketMessage(connection, message, this.services))
  }

  /** Removes client from registry, schedules idle check if no clients remain. */
  async onClose(connection: Connection<ConnectionState>): Promise<void> {
    const services = this.services
    const schedule = this.schedule.bind(this)

    await this.run(
      Effect.gen(function* () {
        yield* removeConnectionIfExists(connection.state?.connectionId, services)
        yield* scheduleIdleCheckIfEmpty(services, schedule)
      })
    )
  }

  async onError(): Promise<void> {}

  async onRequest(request: Request): Promise<Response> {
    return this.run(
      routeHttpRequest(request, this.services, this.handleClose.bind(this))
    )
  }

  /** Scheduled task: transitions session to Idle and disconnects home server if no clients. */
  async checkIdleTimeout(): Promise<void> {
    await this.run(transitionToIdleIfEmpty(this.services))
  }

  /** POST /close: authenticates request, closes all connections, clears session data. */
  private async handleClose(request: Request): Promise<Response> {
    const deleteAll = () => this.ctx.storage.deleteAll()
    const result = await this.runExit(
      authenticateAndCloseSession(request, this.services, deleteAll)
    )

    return Exit.match(result, {
      onFailure: () => new Response('Unauthorized', { status: 401 }),
      onSuccess: (response) => response,
    })
  }
}
