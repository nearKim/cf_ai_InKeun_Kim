import * as LLMProviderHint from './LLMProviderHint'
import { Schema } from '@effect/schema'
import { Data, Effect, Equal, pipe } from 'effect'

export type ClientMessage = {
  readonly prompt: string
  readonly providerHint?: LLMProviderHint.LLMProviderHint
  readonly maxTokens?: number
}

export class InvalidClientMessageError extends Data.TaggedError(
  'InvalidClientMessageError'
)<{
  readonly message: string
  readonly input: unknown
}> {}

const LLMProviderHintSchema = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal('Claude') }),
  Schema.Struct({ _tag: Schema.Literal('OpenAI') }),
  Schema.Struct({ _tag: Schema.Literal('Gemini') })
)


const ClientMessageInputSchema = Schema.Struct({
  prompt: Schema.compose(Schema.Trim, Schema.NonEmptyString),
  providerHint: Schema.optional(LLMProviderHintSchema),
  maxTokens: Schema.optional(Schema.compose(Schema.Int, Schema.Positive)),
})

export const make = (input: {
  prompt: string
  providerHint?: LLMProviderHint.LLMProviderHint
  maxTokens?: number
}): Effect.Effect<ClientMessage, InvalidClientMessageError> => {
  const originalProviderHint = input.providerHint

  return pipe(
    Schema.decodeUnknown(ClientMessageInputSchema)(input),
    Effect.mapError(
      (parseError) =>
        new InvalidClientMessageError({
          message: `Invalid client message: ${parseError.message}`,
          input,
        })
    ),
    Effect.map((decoded) =>
      Data.struct({
        prompt: decoded.prompt,
        providerHint: originalProviderHint,
        maxTokens: decoded.maxTokens,
      })
    )
  )
}

export const getPrompt = (message: ClientMessage): string => message.prompt

export const getProviderHint = (
  message: ClientMessage
): LLMProviderHint.LLMProviderHint | undefined => message.providerHint

export const getMaxTokens = (message: ClientMessage): number | undefined =>
  message.maxTokens

export const equals = (a: ClientMessage, b: ClientMessage): boolean =>
  a.prompt === b.prompt &&
  Equal.equals(a.providerHint, b.providerHint) &&
  a.maxTokens === b.maxTokens

export const toString = (message: ClientMessage): string => {
  const parts: string[] = [`prompt: "${message.prompt}"`]

  if (message.providerHint) {
    parts.push(`provider: ${message.providerHint._tag}`)
  }

  if (message.maxTokens !== undefined) {
    parts.push(`maxTokens: ${message.maxTokens}`)
  }

  return `ClientMessage(${parts.join(', ')})`
}

export const withProviderHint = (
  message: ClientMessage,
  providerHint: LLMProviderHint.LLMProviderHint
): Effect.Effect<ClientMessage, never> =>
  Effect.succeed(
    Data.struct({
      prompt: message.prompt,
      providerHint: providerHint,
      maxTokens: message.maxTokens,
    })
  )

export const withMaxTokens = (
  message: ClientMessage,
  maxTokens: number
): Effect.Effect<ClientMessage, InvalidClientMessageError> => {
  if (maxTokens <= 0 || !Number.isInteger(maxTokens)) {
    return Effect.fail(
      new InvalidClientMessageError({
        message: `maxTokens must be a positive integer, got: ${maxTokens}`,
        input: { maxTokens },
      })
    )
  }

  return Effect.succeed(
    Data.struct({
      prompt: message.prompt,
      providerHint: message.providerHint,
      maxTokens: maxTokens,
    })
  )
}