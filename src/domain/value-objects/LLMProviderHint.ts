import { Data, Effect } from "effect"
import * as EffectType from "effect/Effect"
import { Schema } from "@effect/schema"

const PROVIDERS = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
} as const

export type LLMProviderHint =
  | { readonly _tag: 'Claude' }
  | { readonly _tag: 'OpenAI' }
  | { readonly _tag: 'Gemini' }

export class InvalidLLMProviderHintError extends Data.TaggedError(
  'InvalidLLMProviderHintError'
)<{
  readonly message: string
  readonly input: unknown
}> {}

const LLMProviderHintSchema = Schema.compose(
  Schema.compose(Schema.Trim, Schema.Lowercase),
  Schema.Literal(
    PROVIDERS.CLAUDE,
    PROVIDERS.OPENAI,
    PROVIDERS.GEMINI
  )
)

export const Claude: LLMProviderHint = { _tag: 'Claude' }
export const OpenAI: LLMProviderHint = { _tag: 'OpenAI' }
export const Gemini: LLMProviderHint = { _tag: 'Gemini' }

export const make = (value: string): EffectType.Effect<LLMProviderHint, InvalidLLMProviderHintError> =>
  Schema.decodeUnknown(LLMProviderHintSchema)(value).pipe(
    Effect.mapError(
      (parseError) =>
        new InvalidLLMProviderHintError({
          message: `Invalid LLM provider: ${parseError.message}. Must be one of: ${Object.values(PROVIDERS).join(', ')}`,
          input: value
        })
    ),
    Effect.map((provider): LLMProviderHint => {
      switch (provider) {
        case PROVIDERS.CLAUDE: return Claude
        case PROVIDERS.OPENAI: return OpenAI
        case PROVIDERS.GEMINI: return Gemini
        default: {
          // Exhaustiveness check - TypeScript ensures all cases are handled
          const _exhaustive: never = provider
          throw new Error(`Invariant violation: unhandled provider "${_exhaustive}"`)
        }
      }
    })
  )

export const equals = (a: LLMProviderHint, b: LLMProviderHint): boolean => a._tag === b._tag

export const toString = (hint: LLMProviderHint): string => hint._tag

export const match = <R>(patterns:{
  Claude: () => R
  OpenAI: () => R
  Gemini: () => R
}) => (hint: LLMProviderHint): R => {
  switch (hint._tag) {
    case 'Claude':
      return patterns.Claude()
    case 'OpenAI':
      return patterns.OpenAI()
    case 'Gemini':
      return patterns.Gemini()
  }
}