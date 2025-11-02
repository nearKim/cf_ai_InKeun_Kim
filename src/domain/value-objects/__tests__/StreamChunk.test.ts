import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as StreamChunk from '../StreamChunk'

describe('StreamChunk', () => {
  describe('Delta', () => {
    describe('make', () => {
      it('should create a Delta chunk with content', () => {
        //Given
        const content = 'Hello world'

        //When
        const result = StreamChunk.makeDelta(content)
        const chunk = Effect.runSync(result)

        //Then
        expect(chunk._tag).toBe('Delta')
        if (chunk._tag === 'Delta') {
          expect(chunk.content).toBe(content)
        }
      })

      it('should fail when content is empty', () => {
        //Given
        const emptyContent = ''

        //When
        const result = StreamChunk.makeDelta(emptyContent)

        //Then
        expect(() => Effect.runSync(result)).toThrow()
      })

      it('should allow whitespace-only content', () => {
        //Given
        const whitespace = '   '

        //When
        const result = StreamChunk.makeDelta(whitespace)
        const chunk = Effect.runSync(result)

        //Then
        expect(chunk._tag).toBe('Delta')
        if (chunk._tag === 'Delta') {
          expect(chunk.content).toBe(whitespace)
        }
      })
    })
  })

  describe('Complete', () => {
    describe('make', () => {
      it('should create a Complete chunk without token count', () => {
        //When
        const chunk = StreamChunk.makeComplete()

        //Then
        expect(chunk._tag).toBe('Complete')
        if (chunk._tag === 'Complete') {
          expect(chunk.totalTokens).toBeUndefined()
        }
      })

      it('should create a Complete chunk with token count', () => {
        //Given
        const totalTokens = 1500

        //When
        const chunk = StreamChunk.makeComplete(totalTokens)

        //Then
        expect(chunk._tag).toBe('Complete')
        if (chunk._tag === 'Complete') {
          expect(chunk.totalTokens).toBe(totalTokens)
        }
      })

      it('should fail when token count is negative', () => {
        //Given
        const negativeTokens = -100

        //When & Then
        expect(() => StreamChunk.makeComplete(negativeTokens)).toThrow()
      })

      it('should fail when token count is zero', () => {
        //Given
        const zeroTokens = 0

        //When & Then
        expect(() => StreamChunk.makeComplete(zeroTokens)).toThrow()
      })

      it('should fail when token count is not an integer', () => {
        //Given
        const decimalTokens = 123.45

        //When & Then
        expect(() => StreamChunk.makeComplete(decimalTokens)).toThrow()
      })
    })
  })

  describe('Error', () => {
    describe('make', () => {
      it('should create an Error chunk', () => {
        //Given
        const error = 'Connection timeout'

        //When
        const result = StreamChunk.makeError(error)
        const chunk = Effect.runSync(result)

        //Then
        expect(chunk._tag).toBe('Error')
        if (chunk._tag === 'Error') {
          expect(chunk.error).toBe(error)
        }
      })

      it('should fail when error message is empty', () => {
        //Given
        const emptyError = ''

        //When
        const result = StreamChunk.makeError(emptyError)

        //Then
        expect(() => Effect.runSync(result)).toThrow()
      })

      it('should trim whitespace from error message', () => {
        //Given
        const error = '  Connection failed  '

        //When
        const result = StreamChunk.makeError(error)
        const chunk = Effect.runSync(result)

        //Then
        if (chunk._tag === 'Error') {
          expect(chunk.error).toBe('Connection failed')
        }
      })
    })
  })

  describe('Pattern Matching', () => {
    it('should match Delta chunks', () => {
      //Given
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))

      //When
      const result = StreamChunk.match({
        Delta: (content) => `Delta: ${content}`,
        Complete: (tokens) => `Complete: ${tokens ?? 'no tokens'}`,
        Error: (error) => `Error: ${error}`,
      })(chunk)

      //Then
      expect(result).toBe('Delta: Hello')
    })

    it('should match Complete chunks without tokens', () => {
      //Given
      const chunk = StreamChunk.makeComplete()

      //When
      const result = StreamChunk.match({
        Delta: (content) => `Delta: ${content}`,
        Complete: (tokens) => `Complete: ${tokens ?? 'no tokens'}`,
        Error: (error) => `Error: ${error}`,
      })(chunk)

      //Then
      expect(result).toBe('Complete: no tokens')
    })

    it('should match Complete chunks with tokens', () => {
      //Given
      const chunk = StreamChunk.makeComplete(1500)

      //When
      const result = StreamChunk.match({
        Delta: (content) => `Delta: ${content}`,
        Complete: (tokens) => `Complete: ${tokens ?? 'no tokens'}`,
        Error: (error) => `Error: ${error}`,
      })(chunk)

      //Then
      expect(result).toBe('Complete: 1500')
    })

    it('should match Error chunks', () => {
      //Given
      const chunk = Effect.runSync(StreamChunk.makeError('Failed'))

      //When
      const result = StreamChunk.match({
        Delta: (content) => `Delta: ${content}`,
        Complete: (tokens) => `Complete: ${tokens ?? 'no tokens'}`,
        Error: (error) => `Error: ${error}`,
      })(chunk)

      //Then
      expect(result).toBe('Error: Failed')
    })
  })

  describe('equals', () => {
    it('should return true for equal Delta chunks', () => {
      //Given
      const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const chunk2 = Effect.runSync(StreamChunk.makeDelta('Hello'))

      //When & Then
      expect(StreamChunk.equals(chunk1, chunk2)).toBe(true)
    })

    it('should return false for different Delta chunks', () => {
      //Given
      const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const chunk2 = Effect.runSync(StreamChunk.makeDelta('World'))

      //When & Then
      expect(StreamChunk.equals(chunk1, chunk2)).toBe(false)
    })

    it('should return true for equal Complete chunks', () => {
      //Given
      const chunk1 = StreamChunk.makeComplete(1000)
      const chunk2 = StreamChunk.makeComplete(1000)

      //When & Then
      expect(StreamChunk.equals(chunk1, chunk2)).toBe(true)
    })

    it('should return true for Complete chunks without tokens', () => {
      //Given
      const chunk1 = StreamChunk.makeComplete()
      const chunk2 = StreamChunk.makeComplete()

      //When & Then
      expect(StreamChunk.equals(chunk1, chunk2)).toBe(true)
    })

    it('should return false for different chunk types', () => {
      //Given
      const delta = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const complete = StreamChunk.makeComplete()

      //When & Then
      expect(StreamChunk.equals(delta, complete)).toBe(false)
    })
  })

  describe('toString', () => {
    it('should format Delta chunks', () => {
      //Given
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello world'))

      //When
      const result = StreamChunk.toString(chunk)

      //Then
      expect(result).toContain('Delta')
      expect(result).toContain('Hello world')
    })

    it('should format Complete chunks with tokens', () => {
      //Given
      const chunk = StreamChunk.makeComplete(1500)

      //When
      const result = StreamChunk.toString(chunk)

      //Then
      expect(result).toContain('Complete')
      expect(result).toContain('1500')
    })

    it('should format Complete chunks without tokens', () => {
      //Given
      const chunk = StreamChunk.makeComplete()

      //When
      const result = StreamChunk.toString(chunk)

      //Then
      expect(result).toContain('Complete')
    })

    it('should format Error chunks', () => {
      //Given
      const chunk = Effect.runSync(StreamChunk.makeError('Connection failed'))

      //When
      const result = StreamChunk.toString(chunk)

      //Then
      expect(result).toContain('Error')
      expect(result).toContain('Connection failed')
    })
  })
})