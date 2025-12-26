import { Effect, Context, Ref, Queue, Stream, pipe } from 'effect'
import type { StateService } from './StateService'
import { HomeServerConnectionError, HomeServerSendError } from '../errors'
import { log } from '../logger'

export interface HomeServerService {
  readonly connect: (url: string) => Effect.Effect<void, HomeServerConnectionError>
  readonly disconnect: () => Effect.Effect<void>
  readonly send: (message: string) => Effect.Effect<void, HomeServerSendError>
  readonly isConnected: () => Effect.Effect<boolean>
  readonly messageStream: () => Stream.Stream<string>
}

export class HomeServerServiceTag extends Context.Tag('HomeServerService')<
  HomeServerServiceTag,
  HomeServerService
>() {}

interface HomeServerState {
  readonly ws: WebSocket | null
  readonly url: string | null
}

export const createHomeServerService = (
  stateService: StateService
): Effect.Effect<HomeServerService> =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<HomeServerState>({
      ws: null,
      url: null,
    })
    const messageQueue = yield* Queue.unbounded<string>()

    const updateConnectionState = (status: 'connecting' | 'online' | 'offline') =>
      stateService.update({ type: 'SET_HOME_SERVER', homeServer: status })

    return {
      connect: (url: string) =>
        Effect.gen(function* () {
          yield* updateConnectionState('connecting')

          const ws = yield* Effect.try({
            try: () => new WebSocket(url),
            catch: () => new HomeServerConnectionError({ url, reason: 'Failed to create WebSocket' }),
          })

          yield* Effect.sync(() => {
            ws.addEventListener('open', () => {
              Effect.runSync(updateConnectionState('online'))
              log('info', 'home_server_connected', { url })
            })

            ws.addEventListener('message', (event) => {
              Effect.runSync(Queue.offer(messageQueue, event.data as string))
            })

            ws.addEventListener('close', () => {
              Effect.runSync(updateConnectionState('offline'))
              Effect.runSync(Ref.update(stateRef, (s) => ({ ...s, ws: null })))
            })

            ws.addEventListener('error', () => {
              Effect.runSync(updateConnectionState('offline'))
              Effect.runSync(Ref.update(stateRef, (s) => ({ ...s, ws: null })))
            })
          })

          yield* Ref.update(stateRef, (s) => ({ ...s, ws, url }))
        }),

      disconnect: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          if (state.ws) {
            yield* Effect.sync(() => state.ws!.close(1000, 'Disconnecting'))
            yield* Ref.update(stateRef, (s) => ({ ...s, ws: null }))
            yield* updateConnectionState('offline')
          }
        }),

      send: (message: string) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)

          if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            return yield* Effect.fail(
              new HomeServerSendError({ message, reason: 'not_connected' })
            )
          }

          yield* Effect.try({
            try: () => state.ws!.send(message),
            catch: () => new HomeServerSendError({ message, reason: 'send_failed' }),
          })
        }),

      isConnected: () =>
        pipe(
          Ref.get(stateRef),
          Effect.map((s) => s.ws !== null && s.ws.readyState === WebSocket.OPEN)
        ),

      messageStream: () => Stream.fromQueue(messageQueue),
    }
  })
