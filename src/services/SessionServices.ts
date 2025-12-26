import { Effect } from 'effect'
import type { Env, SessionState } from '../types'
import { createStateService, type StateService } from './StateService'
import { createMessageQueueService, type MessageQueueService } from './MessageQueueService'
import { createAuthenticationService, type AuthenticationService } from './AuthenticationService'
import { createHomeServerService, type HomeServerService } from './HomeServerService'
import { createClientRegistry, type ClientRegistry } from './ClientRegistry'
import { createMessageRouter, type MessageRouter } from './MessageRouter'

export interface SessionServices {
  readonly state: StateService
  readonly queue: MessageQueueService
  readonly auth: AuthenticationService
  readonly homeServer: HomeServerService
  readonly clients: ClientRegistry
  readonly router: MessageRouter
}

type SqlExecutor = <T>(strings: TemplateStringsArray, ...values: unknown[]) => T[]

export const createSessionServices = (
  env: Env,
  sql: SqlExecutor,
  getState: () => SessionState,
  setState: (state: SessionState) => void,
  initialState: SessionState
): Effect.Effect<SessionServices> =>
  Effect.gen(function* () {
    const state = createStateService(
      () => getState() ?? initialState,
      setState
    )

    const queue = createMessageQueueService(sql)

    const auth = createAuthenticationService(
      env.AUTH_SECRET_KEY,
      env.ALLOWED_HOME_SERVER_PATTERN ?? '^wss://.*\\.nearkim\\.dev$'
    )

    const homeServer = yield* createHomeServerService(state)
    const clients = yield* createClientRegistry()

    const queueLimit = parseInt(env.MESSAGE_QUEUE_LIMIT ?? '100', 10)
    const router = createMessageRouter(homeServer, queue, state, queueLimit)

    return { state, queue, auth, homeServer, clients, router }
  })
