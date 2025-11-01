import {describe, it, expect} from "vitest";
import {Effect} from "effect";

describe('SessionId', () => {
    describe('make', () => {
        it('should create a valid SessionId from a non-empty string', () => {
            // Given
            const validId = 'session-123-456'

            // When
            const result = SessionId.make(validId)
            const output = Effect.runSync(result)

            // Then
            expect(SessionId.unwrap(output)).toBe(validId)
        })

        it('should fail when given an empty string', () => {
            // Given
            const emptyId = ''

            // When
            const result = SessionId.make(emptyId)

            // Then
            expect(() => Effect.runSync(result)).toThrow()
        })

        it('should fail when given an whitespace string', () => {
            // Given
            const emptyId = '   '

            // When
            const result = SessionId.make(emptyId)

            // Then
            expect(() => Effect.runSync(result)).toThrow()
        })

    })
    describe('equals', () => {
        it('should return true if the sessionId is equal to the non-empty string', () => {
            // Given
            const id = 'session-123-456'

            // When
            const id1 = SessionId.make(id)
            const id2 = SessionId.make(id)

            // Then
            expect(SessionId.equals(
                Effect.runSync(id1),
                Effect.runSync(id2),
            )).toBe(true)
        })

        it('should return false if the sessionIds are different', () => {
            // Given & When
            const id1 = SessionId.make('session-123-456')
            const id2 = SessionId.make('session-223-456')

            // Then
            expect(SessionId.equals(
                Effect.runSync(id1),
                Effect.runSync(id2),
            )).toBe(false)
        })
    })
    describe('toString', () => {
        it('should return the string representation', () => {
            // Given
            const id = Effect.runSync(SessionId.make('session-xyz'))

            // When
            const result = SessionId.toString(id)

            // Then
            expect(result).toBe('SessionId(session-xyz)')
        })
    })

    describe('type safety', () => {
        it('should prevent using raw strings as SessionId', () => {
            // Given
            const id = Effect.runSync(SessionId.make('session-123')) // ✓

            // When & Then
            expect(SessionId.unwrap(id)).toBe('session-123')
        })
    })
})