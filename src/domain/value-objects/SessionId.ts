import {Brand, Effect, pipe} from "effect";
import {Schema} from '@effect/schema'
import { randomUUID } from 'node:crypto'

export type SessionId = string & Brand<'SessionId'>

const SessionIdBrand = Brand.nominal<SessionId>()

export class InvalidSessionIdError {
    readonly _tag = 'InvalidSessionIdError'
    constructor(
        readonly message: string,
        readonly input: string
    ) {
    }
}

const SessionIdSchema = Schema.compose(
    Schema.Trim,
    Schema.NonEmptyString
)

export const make = (value: string): Effect<SessionId, InvalidSessionIdError> =>
    pipe(
        Schema.decodeUnknown(SessionIdSchema)(value),
        Effect.mapError(
            (parseError) => new InvalidSessionIdError(
                `Invalid SessionId: ${parseError.message}`,
                value,
            )
        ),
        Effect.map(SessionIdBrand)
    )

export const unwrap = (sessionId: SessionId): string => sessionId

export const equals = (a: SessionId, b: SessionId): boolean => a === b

export const toString = (sessionId: SessionId): string => `SessionId(${sessionId})`

export const generate = (): Effect.Effect<SessionId, never> =>
    pipe(
        Effect.sync(() => `session-${randomUUID()}`),
        Effect.flatMap(make),
        Effect.orDie
    )