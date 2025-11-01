import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as SessionId from '../SessionId'

describe('RequestId', () => {
    describe('make', () => {
        it('should create a valid RequestId from a non-empty string', () => {
            //Given
            const validId = 'request-123-abc'

            //When
            const result = RequestId.make(validId)
            const output = Effect.runSync(result)

            //Then
            expect(RequestId.unwrap(output)).toBe(validId)
        })

        it('should fail when given an empty string', () => {
            //Given
            const emptyId = ''

            //When
            const result = RequestId.make(emptyId)

            //Then
            expect(() => Effect.runSync(result)).toThrow()
        })

        it('should fail when given only whitespace', () => {
            //Given
            const whitespaceId = '   '

            //When
            const result = RequestId.make(whitespaceId)

            //Then
            expect(() => Effect.runSync(result)).toThrow()
        })

        it('should trim whitespace from valid input', () => {
            //Given
            const input = '  request-123  '

            //When
            const result = RequestId.make(input)
            const output = Effect.runSync(result)

            //Then
            expect(RequestId.unwrap(output)).toBe('request-123')
        })
    })

    describe('equals', () => {
        it('should return true for RequestIds with the same value', () => {
            //Given
            const id1 = Effect.runSync(RequestId.make('request-123'))
            const id2 = Effect.runSync(RequestId.make('request-123'))

            //When & Then
            expect(RequestId.equals(id1, id2)).toBe(true)
        })

        it('should return false for RequestIds with different values', () => {
            //Given
            const id1 = Effect.runSync(RequestId.make('request-123'))
            const id2 = Effect.runSync(RequestId.make('request-456'))

            //When & Then
            expect(RequestId.equals(id1, id2)).toBe(false)
        })
    })

    describe('toString', () => {
        it('should return the string representation', () => {
            //Given
            const id = Effect.runSync(RequestId.make('request-xyz'))

            //When
            const result = RequestId.toString(id)

            //Then
            expect(result).toBe('RequestId(request-xyz)')
        })
    })

    describe('type safety', () => {
        it('should not allow mixing SessionId and RequestId', () => {
            //Given & When
            const sessionId = Effect.runSync(SessionId.make('session-123'))
            const requestId = Effect.runSync(RequestId.make('request-456'))

            //Then
            expect(SessionId.unwrap(sessionId)).not.toBe(RequestId.unwrap(requestId))
        })
    })
})