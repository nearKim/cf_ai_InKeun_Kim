import { Effect, Match, pipe } from 'effect'
import type { Connection } from '@cloudflare/agents'
import type { ConnectionState } from '../types'
import type { SessionServices } from './SessionServices'
import type { TokenPayload } from '../validation'
import {
  ProtocolVersionError,
  AuthenticationError,
  HomeServerConnectionError,
  QueueOperationError,
} from '../errors'

const buildHomeServerWsUrl = (baseUrl: string, token: string): string => {
  const url = new URL('/ws', baseUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'))
  url.searchParams.set('token', token)
  return url.toString().replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
}
import { extractToken } from '../utils'
import {
  createStatusMessage,
  serializeStatusMessage,
  serializeErrorMessage,
  invalidMessageError,
} from '../messages'
import { handleMessage, type MessageResponse } from './MessageHandler'

type ClientConnection = Connection<ConnectionState>

export const validateProtocolVersion = (
  headers: Headers,
  expected: string
): Effect.Effect<void, ProtocolVersionError> => {
  const received = headers.get('X-Protocol-Version') ?? '1'
  return received === expected
    ? Effect.void
    : Effect.fail(new ProtocolVersionError({ expected, received }))
}

export const extractSessionId = (url: URL): string =>
  url.pathname.split('/').pop() ?? ''

export const validateAndAuthenticate = (
  request: Request,
  services: SessionServices,
  protocolVersion: string
): Effect.Effect<TokenPayload, ProtocolVersionError | AuthenticationError> =>
  pipe(
    validateProtocolVersion(request.headers, protocolVersion),
    Effect.flatMap(() => {
      const token = extractToken(request)
      const sessionId = extractSessionId(new URL(request.url))
      return services.auth.validateSessionAccess(token, sessionId)
    })
  )

export const setupConnection = (
  connection: ClientConnection,
  payload: TokenPayload,
  services: SessionServices
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const connectionId = crypto.randomUUID()
    connection.accept()
    connection.setState({
      connectionId,
      authenticatedAt: Date.now(),
      userId: payload.userId,
    })
    yield* services.clients.add(connectionId, connection)
    return connectionId
  })

export const initializeSessionIfNeeded = (
  payload: TokenPayload,
  services: SessionServices
): Effect.Effect<void> =>
  services.state.getState().sessionId
    ? Effect.void
    : services.state.update({ type: 'INITIALIZE', sessionId: payload.sessionId })

export const activateIfIdle = (
  services: SessionServices
): Effect.Effect<void> =>
  services.state.isIdle()
    ? services.state.update([
        { type: 'SET_STATUS', status: 'Active' },
        { type: 'TOUCH_ACTIVITY' },
      ])
    : Effect.void

export const connectHomeServerIfNeeded = (
  homeServerUrl: string,
  services: SessionServices
): Effect.Effect<void, HomeServerConnectionError | QueueOperationError | AuthenticationError> =>
  Effect.gen(function* () {
    const connected = yield* services.homeServer.isConnected()
    if (!connected) {
      const token = yield* services.auth.generateBackendToken()
      yield* services.homeServer.connect(buildHomeServerWsUrl(homeServerUrl, token))
      yield* services.router.flush()
    }
  })

export const sendStatusMessage = (
  connection: ClientConnection,
  services: SessionServices,
  protocolVersion: string
): Effect.Effect<void> =>
  Effect.sync(() => {
    const state = services.state.getState()
    connection.send(
      serializeStatusMessage(
        createStatusMessage({
          protocolVersion,
          homeServer: state.homeServer,
          queueDepth: state.queueDepth,
          sessionState: state.status,
        })
      )
    )
  })

export const reconnectIfActiveWithStoredUrl = (
  storedUrl: string | undefined,
  services: SessionServices
): Effect.Effect<void, HomeServerConnectionError | QueueOperationError | AuthenticationError> =>
  Effect.gen(function* () {
    if (storedUrl && services.state.isActive()) {
      const token = yield* services.auth.generateBackendToken()
      yield* services.homeServer.connect(buildHomeServerWsUrl(storedUrl, token))
      yield* services.router.flush()
    }
  })

export const removeConnectionIfExists = (
  connectionId: string | undefined,
  services: SessionServices
): Effect.Effect<void> =>
  connectionId ? services.clients.remove(connectionId) : Effect.void

const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000 // 6 hours

export const scheduleIdleCheckIfEmpty = (
  services: SessionServices,
  scheduleFn: (date: Date, handler: string, payload: object) => Promise<unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const isEmpty = yield* services.clients.isEmpty()
    if (isEmpty) {
      yield* Effect.promise(() =>
        scheduleFn(new Date(Date.now() + IDLE_TIMEOUT_MS), 'checkIdleTimeout', {})
      )
    }
  })

type WebSocketMessage = string | ArrayBuffer

const sendResponse = (
  connection: ClientConnection,
  response: MessageResponse
): Effect.Effect<void> =>
  response._tag === 'NoReply'
    ? Effect.void
    : Effect.sync(() => connection.send(response.message))

export const processWebSocketMessage = (
  connection: ClientConnection,
  message: WebSocketMessage,
  services: SessionServices
): Effect.Effect<void> =>
  typeof message === 'string'
    ? pipe(
        handleMessage(message, services.router, services.state),
        Effect.flatMap((response) => sendResponse(connection, response)),
        Effect.catchAll(() => Effect.void)
      )
    : Effect.sync(() =>
        connection.send(
          serializeErrorMessage(invalidMessageError('Binary not supported'))
        )
      )

type HttpRoute =
  | { readonly _tag: 'Health' }
  | { readonly _tag: 'Close'; readonly request: Request }
  | { readonly _tag: 'NotFound' }

const matchRoute = (request: Request): HttpRoute => {
  const url = new URL(request.url)
  if (url.pathname.endsWith('/health')) {
    return { _tag: 'Health' }
  }
  if (url.pathname.endsWith('/close') && request.method === 'POST') {
    return { _tag: 'Close', request }
  }
  return { _tag: 'NotFound' }
}

export const routeHttpRequest = (
  request: Request,
  services: SessionServices,
  handleCloseFn: (request: Request) => Promise<Response>
): Effect.Effect<Response> =>
  pipe(
    matchRoute(request),
    Match.value,
    Match.when({ _tag: 'Health' }, () =>
      Effect.sync(() =>
        Response.json({
          status: 'ok',
          state: services.state.getState(),
        })
      )
    ),
    Match.when({ _tag: 'Close' }, ({ request: req }) =>
      Effect.promise(() => handleCloseFn(req))
    ),
    Match.when({ _tag: 'NotFound' }, () =>
      Effect.sync(() => new Response('Use WebSocket', { status: 426 }))
    ),
    Match.exhaustive
  )

export const transitionToIdleIfEmpty = (
  services: SessionServices
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const isEmpty = yield* services.clients.isEmpty()
    const isActive = services.state.isActive()

    if (isEmpty && isActive) {
      yield* services.state.update({ type: 'SET_STATUS', status: 'Idle' })
      yield* services.homeServer.disconnect()
    }
  })

export const transitionToClosedIfIdle = (
  services: SessionServices,
  deleteAllStorage: () => Promise<void>
): Effect.Effect<void, QueueOperationError> =>
  Effect.gen(function* () {
    if (services.state.isIdle()) {
      yield* services.state.update({ type: 'SET_STATUS', status: 'Closed' })
      yield* services.queue.clear()
      yield* Effect.promise(deleteAllStorage)
    }
  })

export const closeAllConnections = (
  services: SessionServices
): Effect.Effect<void> =>
  pipe(
    services.clients.getAll(),
    Effect.flatMap((connections) =>
      Effect.forEach(
        connections,
        (conn) => Effect.sync(() => conn.close(1000, 'Closed')),
        { discard: true }
      )
    )
  )

export const closeSession = (
  services: SessionServices,
  deleteAllStorage: () => Promise<void>
): Effect.Effect<void, QueueOperationError> =>
  Effect.gen(function* () {
    yield* services.state.update({ type: 'SET_STATUS', status: 'Closed' })
    yield* closeAllConnections(services)
    yield* services.homeServer.disconnect()
    yield* services.queue.clear()
    yield* Effect.promise(deleteAllStorage)
  })

export const authenticateAndCloseSession = (
  request: Request,
  services: SessionServices,
  deleteAllStorage: () => Promise<void>
): Effect.Effect<Response, AuthenticationError | QueueOperationError> =>
  pipe(
    services.auth.validateToken(extractToken(request)),
    Effect.flatMap(() => closeSession(services, deleteAllStorage)),
    Effect.map(() => Response.json({ status: 'closed' }))
  )
