import {Brand, Data, Effect, pipe} from "effect";
import * as BrandType from "effect/Brand";
import * as EffectType from "effect/Effect";
import {Schema} from '@effect/schema'
import { randomUUID } from 'node:crypto'

export type SessionId = string & BrandType.Brand<'SessionId'>

const SessionIdBrand = Brand.nominal<SessionId>()

export class InvalidSessionIdError extends Data.TaggedError(
  'InvalidSessionIdError'
)<{
  readonly message: string
  readonly input: string
}> {}

const SessionIdSchema = Schema.compose(
    Schema.Trim,
    Schema.NonEmptyString
)

export const make = (value: string): EffectType.Effect<SessionId, InvalidSessionIdError> =>
    pipe(
        Schema.decodeUnknown(SessionIdSchema)(value),
        Effect.mapError(
            (parseError) => new InvalidSessionIdError({
                message: `Invalid SessionId: ${parseError.message}`,
                input: value,
            })
        ),
        Effect.map(SessionIdBrand)
    )

export const unwrap = (sessionId: SessionId): string => sessionId

export const equals = (a: SessionId, b: SessionId): boolean => a === b

export const toString = (sessionId: SessionId): string => `SessionId(${sessionId})`

export const generate = (): EffectType.Effect<SessionId, never> =>
    pipe(
        Effect.sync(() => `session-${randomUUID()}`),
        Effect.flatMap(make),
        Effect.orDie
    )