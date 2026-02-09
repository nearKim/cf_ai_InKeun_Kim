import { Effect, pipe } from 'effect'
import { parseEnvelope, type MessageEnvelope } from '../validation'
import type { MessageRouter, RouteResult } from './MessageRouter'
import type { StateService } from './StateService'
import { serializeErrorMessage, invalidMessageError, queueFullError } from '../messages'
import { QueueOperationError } from '../errors'

type IncomingMessage =
  | { readonly type: 'ping' }
  | { readonly type: 'pong' }
  | { readonly type: 'envelope'; readonly data: MessageEnvelope }
  | { readonly type: 'invalid'; readonly reason: string }

export type MessageResponse =
  | { readonly _tag: 'Reply'; readonly message: string }
  | { readonly _tag: 'NoReply' }
  | { readonly _tag: 'Error'; readonly message: string }

const tryParseJson = (raw: string): { type?: string } | null => {
  try {
    return JSON.parse(raw) as { type?: string } | null
  } catch {
    return null
  }
}

const parseMessage = (raw: string): Effect.Effect<IncomingMessage> => {
  const parsed = tryParseJson(raw)

  if (parsed?.type === 'ping') return Effect.succeed({ type: 'ping' as const })
  if (parsed?.type === 'pong') return Effect.succeed({ type: 'pong' as const })

  return pipe(
    parseEnvelope(raw),
    Effect.map((data) => ({ type: 'envelope' as const, data })),
    Effect.catchTag('MessageEnvelopeParseError', (err) =>
      Effect.succeed({ type: 'invalid' as const, reason: err.message })
    )
  )
}

const routeResultToResponse = (result: RouteResult): MessageResponse =>
  result._tag === 'QueueFull'
    ? { _tag: 'Error', message: serializeErrorMessage(queueFullError(result.retryAfter)) }
    : { _tag: 'NoReply' }

const handleEnvelope = (
  raw: string,
  id: string,
  router: MessageRouter,
  state: StateService
): Effect.Effect<MessageResponse, QueueOperationError> =>
  pipe(
    state.update({ type: 'TOUCH_ACTIVITY' }),
    Effect.flatMap(() => router.route(raw, id)),
    Effect.map(routeResultToResponse)
  )

export const handleMessage = (
  raw: string,
  router: MessageRouter,
  state: StateService
): Effect.Effect<MessageResponse, QueueOperationError> =>
  Effect.gen(function* () {
    const msg = yield* parseMessage(raw)

    switch (msg.type) {
      case 'ping':
        return { _tag: 'Reply', message: '{"type":"pong"}' } as const
      case 'pong':
        return { _tag: 'NoReply' } as const
      case 'invalid':
        return {
          _tag: 'Error',
          message: serializeErrorMessage(invalidMessageError(msg.reason)),
        } as const
      case 'envelope':
        return yield* handleEnvelope(raw, msg.data.id, router, state)
    }
  })
