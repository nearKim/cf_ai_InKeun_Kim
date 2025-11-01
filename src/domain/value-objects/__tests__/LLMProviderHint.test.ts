import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as LLMProviderHint from '../LLMProviderHint'

describe('LLMProviderHint', () => {
  describe('make', () => {
    it('should create Claude provider hint from lowercase string', () => {
      // Given
      const input = 'claude'

      // When
      const result = LLMProviderHint.make(input)
      const output = Effect.runSync(result)

      // Then
      expect(output._tag).toBe('Claude')
    })

    it('should create OpenAI provider hint from lowercase string', () => {
      // Given
      const input = 'openai'

      // When
      const result = LLMProviderHint.make(input)
      const output = Effect.runSync(result)

      // Then
      expect(output._tag).toBe('OpenAI')
    })

    it('should create Gemini provider hint from lowercase string', () => {
      // Given
      const input = 'gemini'

      // When
      const result = LLMProviderHint.make(input)
      const output = Effect.runSync(result)

      // Then
      expect(output._tag).toBe('Gemini')
    })

    it('should be case-insensitive for Claude', () => {
      // Given
      const inputs = ['CLAUDE', 'Claude', 'claude', 'cLaUdE']

      // When & Then
      inputs.forEach((input) => {
        const result = LLMProviderHint.make(input)
        const output = Effect.runSync(result)
        expect(output._tag).toBe('Claude')
      })
    })

    it('should be case-insensitive for OpenAI', () => {
      // Given
      const inputs = ['OPENAI', 'OpenAI', 'openai', 'OpEnAi']

      // When & Then
      inputs.forEach((input) => {
        const result = LLMProviderHint.make(input)
        const output = Effect.runSync(result)
        expect(output._tag).toBe('OpenAI')
      })
    })

    it('should be case-insensitive for Gemini', () => {
      // Given
      const inputs = ['GEMINI', 'Gemini', 'gemini', 'GeMiNi']

      // When & Then
      inputs.forEach((input) => {
        const result = LLMProviderHint.make(input)
        const output = Effect.runSync(result)
        expect(output._tag).toBe('Gemini')
      })
    })

    it('should fail for invalid provider string', () => {
      // Given
      const invalidInputs = ['gpt-4', 'chatgpt', 'llama', 'invalid', '']

      // When & Then
      invalidInputs.forEach((input) => {
        const result = LLMProviderHint.make(input)
        expect(() => Effect.runSync(result)).toThrow()
      })
    })

    it('should fail with descriptive error message', () => {
      // Given
      const invalidInput = 'gpt-4'

      // When
      const result = LLMProviderHint.make(invalidInput)

      // Then
      expect(() => Effect.runSync(result)).toThrow(/Invalid LLM provider/)
    })

    it('should trim whitespace before validation', () => {
      // Given
      const input = '  claude  '

      // When
      const result = LLMProviderHint.make(input)
      const output = Effect.runSync(result)

      // Then
      expect(output._tag).toBe('Claude')
    })
  })

  describe('equals', () => {
    it('should return true for same provider (Claude)', () => {
      // Given
      const hint1 = Effect.runSync(LLMProviderHint.make('claude'))
      const hint2 = Effect.runSync(LLMProviderHint.make('CLAUDE'))

      // When & Then
      expect(LLMProviderHint.equals(hint1, hint2)).toBe(true)
    })

    it('should return true for same provider (OpenAI)', () => {
      // Given
      const hint1 = Effect.runSync(LLMProviderHint.make('openai'))
      const hint2 = Effect.runSync(LLMProviderHint.make('OpenAI'))

      // When & Then
      expect(LLMProviderHint.equals(hint1, hint2)).toBe(true)
    })

    it('should return true for same provider (Gemini)', () => {
      // Given
      const hint1 = Effect.runSync(LLMProviderHint.make('gemini'))
      const hint2 = Effect.runSync(LLMProviderHint.make('GEMINI'))

      // When & Then
      expect(LLMProviderHint.equals(hint1, hint2)).toBe(true)
    })

    it('should return false for different providers', () => {
      // Given
      const claude = Effect.runSync(LLMProviderHint.make('claude'))
      const openai = Effect.runSync(LLMProviderHint.make('openai'))
      const gemini = Effect.runSync(LLMProviderHint.make('gemini'))

      // When & Then
      expect(LLMProviderHint.equals(claude, openai)).toBe(false)
      expect(LLMProviderHint.equals(openai, gemini)).toBe(false)
      expect(LLMProviderHint.equals(claude, gemini)).toBe(false)
    })

    it('should work with constant constructors', () => {
      // Given & When & Then
      expect(LLMProviderHint.equals(LLMProviderHint.Claude, LLMProviderHint.Claude)).toBe(true)
      expect(LLMProviderHint.equals(LLMProviderHint.OpenAI, LLMProviderHint.OpenAI)).toBe(true)
      expect(LLMProviderHint.equals(LLMProviderHint.Gemini, LLMProviderHint.Gemini)).toBe(true)
      expect(LLMProviderHint.equals(LLMProviderHint.Claude, LLMProviderHint.OpenAI)).toBe(false)
    })
  })

  describe('toString', () => {
    it('should return "Claude" for Claude provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('claude'))

      // When
      const result = LLMProviderHint.toString(hint)

      // Then
      expect(result).toBe('Claude')
    })

    it('should return "OpenAI" for OpenAI provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('openai'))

      // When
      const result = LLMProviderHint.toString(hint)

      // Then
      expect(result).toBe('OpenAI')
    })

    it('should return "Gemini" for Gemini provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('gemini'))

      // When
      const result = LLMProviderHint.toString(hint)

      // Then
      expect(result).toBe('Gemini')
    })
  })

  describe('pattern matching with match helper', () => {
    it('should match Claude provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('claude'))

      // When
      const result = LLMProviderHint.match({
        Claude: () => 'Matched Claude',
        OpenAI: () => 'Matched OpenAI',
        Gemini: () => 'Matched Gemini',
      })(hint)

      // Then
      expect(result).toBe('Matched Claude')
    })

    it('should match OpenAI provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('openai'))

      // When
      const result = LLMProviderHint.match({
        Claude: () => 'Matched Claude',
        OpenAI: () => 'Matched OpenAI',
        Gemini: () => 'Matched Gemini',
      })(hint)

      // Then
      expect(result).toBe('Matched OpenAI')
    })

    it('should match Gemini provider', () => {
      // Given
      const hint = Effect.runSync(LLMProviderHint.make('gemini'))

      // When
      const result = LLMProviderHint.match({
        Claude: () => 'Matched Claude',
        OpenAI: () => 'Matched OpenAI',
        Gemini: () => 'Matched Gemini',
      })(hint)

      // Then
      expect(result).toBe('Matched Gemini')
    })

    it('should support pattern matching with values', () => {
      // Given
      const providers = [
        LLMProviderHint.Claude,
        LLMProviderHint.OpenAI,
        LLMProviderHint.Gemini,
      ]

      // When
      const results = providers.map(
        LLMProviderHint.match({
          Claude: () => 1,
          OpenAI: () => 2,
          Gemini: () => 3,
        })
      )

      // Then
      expect(results).toEqual([1, 2, 3])
    })
  })

  describe('constant constructors', () => {
    it('should provide Claude constant', () => {
      // Given & When
      const claude = LLMProviderHint.Claude

      // Then
      expect(claude._tag).toBe('Claude')
    })

    it('should provide OpenAI constant', () => {
      // Given & When
      const openai = LLMProviderHint.OpenAI

      // Then
      expect(openai._tag).toBe('OpenAI')
    })

    it('should provide Gemini constant', () => {
      // Given & When
      const gemini = LLMProviderHint.Gemini

      // Then
      expect(gemini._tag).toBe('Gemini')
    })
  })

  describe('type safety', () => {
    it('should enforce exhaustive pattern matching', () => {
      // Given
      const hint = LLMProviderHint.Claude

      // When - TypeScript compiler ensures all cases are handled
      const handleProvider = (h: LLMProviderHint.LLMProviderHint): string => {
        switch (h._tag) {
          case 'Claude':
            return 'claude-model'
          case 'OpenAI':
            return 'openai-model'
          case 'Gemini':
            return 'gemini-model'
          // If we add a new provider, TypeScript will error here
        }
      }

      // Then
      expect(handleProvider(hint)).toBe('claude-model')
    })
  })
})
