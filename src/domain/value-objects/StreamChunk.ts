import {Data, Effect, Equal, pipe} from 'effect'
import * as EffectType from 'effect/Effect'
import { Schema } from '@effect/schema'

export type StreamChunk =
  | {
      readonly _tag: 'Delta'
      readonly content: string
    }
  | {
      readonly _tag: 'Complete'
      readonly totalTokens?: number
    }
  | {
      readonly _tag: 'Error'
      readonly error: string
    }

export class InvalidStreamChunkError extends Data.TaggedError(
  'InvalidStreamChunkError'
)<{
  readonly message: string
  readonly input: unknown
}> {}

const DeltaContentSchema = Schema.NonEmptyString

const CompleteTokensSchema = Schema.compose(Schema.Int, Schema.Positive)

const ErrorMessageSchema = Schema.compose(Schema.Trim, Schema.NonEmptyString)

export const makeDelta = (
  content: string
): EffectType.Effect<StreamChunk, InvalidStreamChunkError> => {
  if (content === '') {
    return Effect.fail(
      new InvalidStreamChunkError({
        message: 'Delta content cannot be empty',
        input: content,
      })
    )
  }

  return Effect.succeed(
    Data.struct({
      _tag: 'Delta' as const,
      content,
    })
  )
}

export const makeComplete = (
  totalTokens?: number
): StreamChunk | never => {
  if (totalTokens !== undefined) {
    if (totalTokens <= 0 || !Number.isInteger(totalTokens)) {
      throw new InvalidStreamChunkError({
        message: `totalTokens must be a positive integer, got: ${totalTokens}`,
        input: { totalTokens },
      })
    }
  }

  return Data.struct({
    _tag: 'Complete' as const,
    totalTokens,
  })
}

export const makeError = (error: string) =>
  pipe(
    Schema.decodeUnknown(ErrorMessageSchema)(error),
    Effect.mapError(
      (parseError) =>
        new InvalidStreamChunkError({
          message: `Invalid error message: ${parseError.message}`,
          input: error,
        })
    ),
    Effect.map((trimmedError) =>
      Data.struct({
        _tag: 'Error' as const,
        error: trimmedError,
      })
    )
  )

export const isDelta = (chunk: StreamChunk): chunk is Extract<StreamChunk, { _tag: 'Delta' }> =>
  chunk._tag === 'Delta'

export const isComplete = (chunk: StreamChunk): chunk is Extract<StreamChunk, { _tag: 'Complete' }> =>
  chunk._tag === 'Complete'

export const isError = (chunk: StreamChunk): chunk is Extract<StreamChunk, { _tag: 'Error' }> =>
  chunk._tag === 'Error'

export const match =
  <R>(patterns: {
    Delta: (content: string) => R
    Complete: (totalTokens: number | undefined) => R
    Error: (error: string) => R
  }) =>
  (chunk: StreamChunk): R => {
    switch (chunk._tag) {
      case 'Delta':
        return patterns.Delta(chunk.content)
      case 'Complete':
        return patterns.Complete(chunk.totalTokens)
      case 'Error':
        return patterns.Error(chunk.error)
    }
  }

export const equals = Equal.equals

export const toString = (chunk: StreamChunk): string => {
  switch (chunk._tag) {
    case 'Delta':
      return `StreamChunk.Delta(content: "${chunk.content}")`
    case 'Complete':
      return chunk.totalTokens !== undefined
        ? `StreamChunk.Complete(totalTokens: ${chunk.totalTokens})`
        : 'StreamChunk.Complete()'
    case 'Error':
      return `StreamChunk.Error(error: "${chunk.error}")`
  }
}
