import { Effect, pipe } from 'effect'
import type { HomeServerService } from './HomeServerService'
import type { MessageQueueService } from './MessageQueueService'
import type { StateService } from './StateService'
import { QueueOperationError } from '../errors'
import { log } from '../logger'

export type RouteResult =
  | { readonly _tag: 'Sent' }
  | { readonly _tag: 'Queued' }
  | { readonly _tag: 'QueueFull'; readonly retryAfter: number }

export interface MessageRouter {
  readonly route: (rawJson: string, id: string) => Effect.Effect<RouteResult, QueueOperationError>
  readonly flush: () => Effect.Effect<number, QueueOperationError>
  readonly syncQueueDepth: () => Effect.Effect<void, QueueOperationError>
}

export const createMessageRouter = (
  homeServer: HomeServerService,
  queue: MessageQueueService,
  state: StateService,
  queueLimit: number
): MessageRouter => {
  const syncQueueDepth: Effect.Effect<void, QueueOperationError> =
    pipe(
      queue.count(),
      Effect.flatMap((count) =>
        pipe(
          Effect.sync(() => state.getState().queueDepth),
          Effect.flatMap((current) =>
            count !== current
              ? state.update({ type: 'SET_QUEUE_DEPTH', queueDepth: count })
              : Effect.void
          )
        )
      ),
      Effect.asVoid
    )

  const queueMessage = (
    rawJson: string,
    id: string
  ): Effect.Effect<RouteResult, QueueOperationError> =>
    pipe(
      queue.enqueue(id, rawJson, queueLimit),
      Effect.flatMap(() => syncQueueDepth),
      Effect.map(() => ({ _tag: 'Queued' as const })),
      Effect.catchTag('QueueFullError', (err) => {
        log('warn', 'queue_full', {
          sessionId: state.getState().sessionId,
          limit: queueLimit,
          count: err.currentCount,
        })
        return Effect.succeed({
          _tag: 'QueueFull' as const,
          retryAfter: err.retryAfter,
        })
      })
    )

  return {
    route: (rawJson, id) =>
      pipe(
        homeServer.isConnected(),
        Effect.flatMap((connected) =>
          connected
            ? pipe(
                homeServer.send(rawJson),
                Effect.map(() => ({ _tag: 'Sent' as const })),
                Effect.catchTag('HomeServerSendError', () => queueMessage(rawJson, id))
              )
            : queueMessage(rawJson, id)
        )
      ),

    flush: () =>
      Effect.gen(function* () {
        const connected = yield* homeServer.isConnected()
        if (!connected) return 0

        const messages = yield* queue.getAll()
        let flushedCount = 0

        for (const msg of messages) {
          const stillConnected = yield* homeServer.isConnected()
          if (!stillConnected) break

          const sendResult = yield* pipe(
            homeServer.send(msg.envelopeJson),
            Effect.map(() => true),
            Effect.catchTag('HomeServerSendError', () => Effect.succeed(false))
          )

          if (sendResult) {
            yield* queue.dequeue(msg.id)
            flushedCount++
          } else {
            break
          }
        }

        if (flushedCount > 0) {
          yield* syncQueueDepth
        }

        return flushedCount
      }),

    syncQueueDepth: () => syncQueueDepth,
  }
}
