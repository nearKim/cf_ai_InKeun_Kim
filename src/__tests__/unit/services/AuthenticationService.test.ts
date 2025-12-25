import { it, describe } from '@effect/vitest'
import { Effect, Either } from 'effect'
import { expect } from 'vitest'
import { createAuthenticationService } from '../../../services'
import { createTestToken, AuthenticationError } from '../../../validation'

describe('AuthenticationService', () => {
  const secretKey = 'test-secret-key-for-jwt-signing'
  const allowedPattern = /^wss:\/\/.*\.nearkim\.dev$/

  const validPayload = {
    userId: 'user-123',
    sessionId: 'session-456',
    homeServerUrl: 'wss://api.nearkim.dev',
  }

  const createService = () => createAuthenticationService(secretKey, allowedPattern)

  describe('validateToken', () => {
    it.effect('should return payload for valid token', () =>
      Effect.gen(function* () {
        const service = createService()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* service.validateToken(validToken)

        expect(result.userId).toBe(validPayload.userId)
        expect(result.sessionId).toBe(validPayload.sessionId)
        expect(result.homeServerUrl).toBe(validPayload.homeServerUrl)
      })
    )

    it.effect('should fail for null token', () =>
      Effect.gen(function* () {
        const service = createService()

        const result = yield* Effect.either(service.validateToken(null))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(AuthenticationError)
          expect(result.left.reason).toBe('missing_token')
        }
      })
    )

    it.effect('should fail for invalid token', () =>
      Effect.gen(function* () {
        const service = createService()

        const result = yield* Effect.either(service.validateToken('invalid'))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_token')
        }
      })
    )
  })

  describe('validateSessionAccess', () => {
    it.effect('should return payload when session matches', () =>
      Effect.gen(function* () {
        const service = createService()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* service.validateSessionAccess(validToken, 'session-456')

        expect(result.userId).toBe(validPayload.userId)
        expect(result.sessionId).toBe(validPayload.sessionId)
      })
    )

    it.effect('should fail when session does not match', () =>
      Effect.gen(function* () {
        const service = createService()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* Effect.either(
          service.validateSessionAccess(validToken, 'different-session')
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(AuthenticationError)
          expect(result.left.reason).toBe('session_mismatch')
          expect(result.left.message).toContain('does not match')
        }
      })
    )

    it.effect('should fail for invalid token before checking session', () =>
      Effect.gen(function* () {
        const service = createService()

        const result = yield* Effect.either(
          service.validateSessionAccess('invalid', 'any-session')
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_token')
        }
      })
    )

    it.effect('should fail for null token', () =>
      Effect.gen(function* () {
        const service = createService()

        const result = yield* Effect.either(
          service.validateSessionAccess(null, 'session-456')
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('missing_token')
        }
      })
    )
  })

  describe('pattern configuration', () => {
    it.effect('should accept string pattern', () =>
      Effect.gen(function* () {
        const service = createAuthenticationService(secretKey, '^wss://.*\\.nearkim\\.dev$')
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* service.validateToken(validToken)

        expect(result.userId).toBe(validPayload.userId)
      })
    )

    it.effect('should accept RegExp pattern', () =>
      Effect.gen(function* () {
        const service = createAuthenticationService(secretKey, /^wss:\/\/.*\.nearkim\.dev$/)
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* service.validateToken(validToken)

        expect(result.userId).toBe(validPayload.userId)
      })
    )

    it.effect('should use default pattern when not provided', () =>
      Effect.gen(function* () {
        const service = createAuthenticationService(secretKey)
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )

        const result = yield* service.validateToken(validToken)

        expect(result.userId).toBe(validPayload.userId)
      })
    )
  })
})
