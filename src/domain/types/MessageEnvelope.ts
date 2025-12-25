import { Schema } from '@effect/schema'
import { Effect, Data, pipe } from 'effect'

export class MessageEnvelopeParseError extends Data.TaggedError('MessageEnvelopeParseError')<{
  readonly reason: 'invalid_json' | 'invalid_structure' | 'missing_field'
  readonly message: string
  readonly cause?: unknown
}> {}

export type MessageEnvelope = {
  readonly id: string
  readonly timestamp: number
  readonly payload: string
}

export const MessageEnvelopeSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  timestamp: Schema.Positive,
  payload: Schema.String,
})

export const parse = (raw: string): Effect.Effect<MessageEnvelope, MessageEnvelopeParseError> =>
  pipe(
    Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (error) =>
        new MessageEnvelopeParseError({
          reason: 'invalid_json',
          message: 'Failed to parse JSON',
          cause: error,
        }),
    }),
    Effect.flatMap((parsed) =>
      pipe(
        Schema.decodeUnknown(MessageEnvelopeSchema)(parsed),
        Effect.mapError(
          (parseError) =>
            new MessageEnvelopeParseError({
              reason: 'invalid_structure',
              message: `Invalid envelope structure: ${parseError.message}`,
              cause: parseError,
            })
        )
      )
    )
  )

export const create = (params: {
  id?: string
  payload: string
  timestamp?: number
}): MessageEnvelope =>
  Data.struct({
    id: params.id ?? crypto.randomUUID(),
    timestamp: params.timestamp ?? Date.now(),
    payload: params.payload,
  })

export const serialize = (envelope: MessageEnvelope): string => JSON.stringify(envelope)
