import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as ClientMessage from '../ClientMessage'
import * as LLMProviderHint from '../LLMProviderHint'

describe('ClientMessage', () => {
  describe('make', () => {
    it('should create a valid ClientMessage with only prompt', () => {
      //Given
      const prompt = 'Hello, how are you?'

      //When
      const result = ClientMessage.make({ prompt })
      const message = Effect.runSync(result)

      //Then
      expect(ClientMessage.getPrompt(message)).toBe(prompt)
      expect(ClientMessage.getProviderHint(message)).toBeUndefined()
      expect(ClientMessage.getMaxTokens(message)).toBeUndefined()
    })

    it('should create a ClientMessage with all fields', () => {
      //Given
      const prompt = 'Explain quantum computing'
      const providerHint = LLMProviderHint.Claude
      const maxTokens = 1000

      //When
      const result = ClientMessage.make({ prompt, providerHint, maxTokens })
      const message = Effect.runSync(result)

      //Then
      expect(ClientMessage.getPrompt(message)).toBe(prompt)
      expect(ClientMessage.getProviderHint(message)).toStrictEqual(providerHint)
      expect(ClientMessage.getMaxTokens(message)).toBe(maxTokens)
    })

    it('should fail when prompt is empty', () => {
      //Given
      const emptyPrompt = ''

      //When
      const result = ClientMessage.make({ prompt: emptyPrompt })

      //Then
      expect(() => Effect.runSync(result)).toThrow()
    })

    it('should fail when prompt is only whitespace', () => {
      //Given
      const whitespacePrompt = '   '

      //When
      const result = ClientMessage.make({ prompt: whitespacePrompt })

      //Then
      expect(() => Effect.runSync(result)).toThrow()
    })

    it('should trim whitespace from prompt', () => {
      //Given
      const prompt = '  Hello World  '

      //When
      const result = ClientMessage.make({ prompt })
      const message = Effect.runSync(result)

      //Then
      expect(ClientMessage.getPrompt(message)).toBe('Hello World')
    })

    it('should fail when maxTokens is zero', () => {
      //Given
      const prompt = 'Hello'
      const maxTokens = 0

      //When
      const result = ClientMessage.make({ prompt, maxTokens })

      //Then
      expect(() => Effect.runSync(result)).toThrow()
    })

    it('should fail when maxTokens is negative', () => {
      //Given
      const prompt = 'Hello'
      const maxTokens = -100

      //When
      const result = ClientMessage.make({ prompt, maxTokens })

      //Then
      expect(() => Effect.runSync(result)).toThrow()
    })

    it('should accept valid maxTokens', () => {
      //Given
      const prompt = 'Test'
      const maxTokens = 1000

      //When
      const result = ClientMessage.make({ prompt, maxTokens })
      const message = Effect.runSync(result)

      //Then
      expect(ClientMessage.getMaxTokens(message)).toBe(maxTokens)
    })

    it('should work with all LLMProviderHint variants', () => {
      //Given
      const prompt = 'Test'
      const providers = [
        LLMProviderHint.Claude,
        LLMProviderHint.OpenAI,
        LLMProviderHint.Gemini,
      ]

      //When & Then
      providers.forEach((provider) => {
        const result = ClientMessage.make({ prompt, providerHint: provider })
        const message = Effect.runSync(result)
        expect(ClientMessage.getProviderHint(message)).toStrictEqual(provider)
      })
    })
  })

  describe('equals', () => {
    it('should return true for ClientMessages with identical content', () => {
      //Given
      const msg1 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.Claude,
          maxTokens: 1000,
        })
      )
      const msg2 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.Claude,
          maxTokens: 1000,
        })
      )

      //When & Then
      expect(ClientMessage.equals(msg1, msg2)).toBe(true)
    })

    it('should return false for ClientMessages with different prompts', () => {
      //Given
      const msg1 = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))
      const msg2 = Effect.runSync(ClientMessage.make({ prompt: 'Hi' }))

      //When & Then
      expect(ClientMessage.equals(msg1, msg2)).toBe(false)
    })

    it('should return false for ClientMessages with different providerHints', () => {
      //Given
      const msg1 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.Claude,
        })
      )
      const msg2 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.OpenAI,
        })
      )

      //When & Then
      expect(ClientMessage.equals(msg1, msg2)).toBe(false)
    })

    it('should return false for ClientMessages with different maxTokens', () => {
      //Given
      const msg1 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          maxTokens: 1000,
        })
      )
      const msg2 = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          maxTokens: 2000,
        })
      )

      //When & Then
      expect(ClientMessage.equals(msg1, msg2)).toBe(false)
    })

    it('should handle undefined optional fields correctly', () => {
      //Given
      const msg1 = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))
      const msg2 = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))

      //When & Then
      expect(ClientMessage.equals(msg1, msg2)).toBe(true)
    })
  })

  describe('toString', () => {
    it('should return a readable string representation with all fields', () => {
      //Given
      const message = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.Claude,
          maxTokens: 1000,
        })
      )

      //When
      const result = ClientMessage.toString(message)

      //Then
      expect(result).toContain('ClientMessage')
      expect(result).toContain('Hello')
      expect(result).toContain('Claude')
      expect(result).toContain('1000')
    })

    it('should handle optional fields in string representation', () => {
      //Given
      const message = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
        })
      )

      //When
      const result = ClientMessage.toString(message)

      //Then
      expect(result).toContain('ClientMessage')
      expect(result).toContain('Hello')
    })
  })

  describe('withProviderHint', () => {
    it('should create a new ClientMessage with updated provider hint', () => {
      //Given
      const original = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))

      //When
      const updated = Effect.runSync(
        ClientMessage.withProviderHint(original, LLMProviderHint.Claude)
      )

      //Then
      expect(ClientMessage.getProviderHint(original)).toBeUndefined()
      expect(ClientMessage.getProviderHint(updated)).toStrictEqual(
        LLMProviderHint.Claude
      )
      expect(ClientMessage.getPrompt(updated)).toBe('Hello')
    })

    it('should preserve other fields when updating provider hint', () => {
      //Given
      const original = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          maxTokens: 1000,
        })
      )

      //When
      const updated = Effect.runSync(
        ClientMessage.withProviderHint(original, LLMProviderHint.OpenAI)
      )

      //Then
      expect(ClientMessage.getMaxTokens(updated)).toBe(1000)
      expect(ClientMessage.getProviderHint(updated)).toStrictEqual(
        LLMProviderHint.OpenAI
      )
    })
  })

  describe('withMaxTokens', () => {
    it('should create a new ClientMessage with updated max tokens', () => {
      //Given
      const original = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))

      //When
      const result = ClientMessage.withMaxTokens(original, 2000)
      const updated = Effect.runSync(result)

      //Then
      expect(ClientMessage.getMaxTokens(original)).toBeUndefined()
      expect(ClientMessage.getMaxTokens(updated)).toBe(2000)
      expect(ClientMessage.getPrompt(updated)).toBe('Hello')
    })

    it('should fail when setting invalid max tokens', () => {
      //Given
      const original = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))

      //When
      const result = ClientMessage.withMaxTokens(original, -100)

      //Then
      expect(() => Effect.runSync(result)).toThrow()
    })

    it('should preserve other fields when updating max tokens', () => {
      //Given
      const original = Effect.runSync(
        ClientMessage.make({
          prompt: 'Hello',
          providerHint: LLMProviderHint.Gemini,
        })
      )

      //When
      const result = ClientMessage.withMaxTokens(original, 2000)
      const updated = Effect.runSync(result)

      //Then
      expect(ClientMessage.getProviderHint(updated)).toStrictEqual(
        LLMProviderHint.Gemini
      )
      expect(ClientMessage.getMaxTokens(updated)).toBe(2000)
    })
  })

  describe('immutability', () => {
    it('should return new instances on modification', () => {
      //Given
      const original = Effect.runSync(
        ClientMessage.make({ prompt: 'Original' })
      )

      //When
      const updated = Effect.runSync(
        ClientMessage.withProviderHint(original, LLMProviderHint.Claude)
      )

      //Then
      expect(original).not.toBe(updated)
      expect(ClientMessage.getProviderHint(original)).toBeUndefined()
      expect(ClientMessage.getProviderHint(updated)).toStrictEqual(
        LLMProviderHint.Claude
      )
    })
  })
})