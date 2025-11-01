import {Brand, Effect, pipe} from "effect";
import * as BrandType from "effect/Brand";
import * as EffectType from "effect/Effect";
import {Schema} from '@effect/schema'

export type RequestId = string & BrandType.Brand<'RequestId'>

const RequestIdBrand = Brand.nominal<RequestId>()

export class InvalidRequestIdError {
  readonly _tag = 'InvalidRequestIdError'

  constructor(
    readonly message: string,
    readonly input: string
  ) {
  }
}

const RequestIdSchema = Schema.compose(
  Schema.Trim,
  Schema.NonEmptyString
)

export const make = (value: string): EffectType.Effect<RequestId, InvalidRequestIdError> =>
  pipe(
    Schema.decodeUnknown(RequestIdSchema)(value),
    Effect.mapError(
      parseError => new InvalidRequestIdError(
        `Invalid RequestId: ${parseError.message}`,
        value,
      )
    ),
    Effect.map(RequestIdBrand
    )
  )

export const unwrap = (requestId: RequestId): string => requestId

export const equals = (a: RequestId, b: RequestId): boolean => a === b

export const toString = (requestId: RequestId): string => `RequestId(${requestId})`

export const generate = (): EffectType.Effect<RequestId, never> =>
  pipe(
    Effect.sync(() => `request-${crypto.randomUUID()}`),
    Effect.flatMap(make),
    Effect.orDie
  )