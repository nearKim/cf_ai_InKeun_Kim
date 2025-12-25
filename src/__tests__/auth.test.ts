import { it, describe } from '@effect/vitest'
import { Effect, Either } from 'effect'
import {
  createTokenValidator,
  createTestToken,
  createExpiredTestToken,
  AuthenticationError,
} from '../validation'

describe('TokenValidator', () => {
  const secretKey = 'test-secret-key-for-jwt-signing'
  const allowedPattern = /^wss:\/\/.*\.nearkim\.dev$/
  const createValidator = () => createTokenValidator(secretKey, allowedPattern)

  const validPayload = {
    userId: 'user-123',
    sessionId: 'session-456',
    homeServerUrl: 'wss://api.nearkim.dev',
  }

  describe('Missing token', () => {
    it.effect('should fail when token is null', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const result = yield* Effect.either(validator.validate(null))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(AuthenticationError)
          expect(result.left.reason).toBe('missing_token')
        }
      })
    )

    it.effect('should fail when token is empty string', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const result = yield* Effect.either(validator.validate(''))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('missing_token')
        }
      })
    )

    it.effect('should fail when token is whitespace only', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const result = yield* Effect.either(validator.validate('   '))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('missing_token')
        }
      })
    )
  })

  describe('Invalid token format', () => {
    it.effect('should fail when token is not a valid JWT', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const result = yield* Effect.either(validator.validate('not-a-jwt'))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_token')
        }
      })
    )

    it.effect('should fail when token is signed with wrong secret', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const wrongSecretToken = yield* Effect.promise(() =>
          createTestToken(validPayload, 'wrong-secret')
        )
        const result = yield* Effect.either(validator.validate(wrongSecretToken))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_token')
        }
      })
    )

    it.effect('should fail when token is tampered', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )
        const tamperedToken = validToken.slice(0, -5) + 'xxxxx'
        const result = yield* Effect.either(validator.validate(tamperedToken))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_token')
        }
      })
    )
  })

  describe('Token expiration', () => {
    it.effect('should fail when token is expired', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const expiredToken = yield* Effect.promise(() =>
          createExpiredTestToken(validPayload, secretKey)
        )
        const result = yield* Effect.either(validator.validate(expiredToken))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('expired_token')
        }
      })
    )
  })

  describe('Home server URL validation', () => {
    it.effect('should fail when home server URL does not match pattern', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const invalidUrlToken = yield* Effect.promise(() =>
          createTestToken(
            { ...validPayload, homeServerUrl: 'wss://malicious.example.com' },
            secretKey
          )
        )
        const result = yield* Effect.either(validator.validate(invalidUrlToken))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_home_server_url')
        }
      })
    )
  })

  describe('Successful validation', () => {
    it.effect('should return payload when token is valid', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )
        const result = yield* validator.validate(validToken)

        expect(result.userId).toBe(validPayload.userId)
        expect(result.sessionId).toBe(validPayload.sessionId)
        expect(result.homeServerUrl).toBe(validPayload.homeServerUrl)
      })
    )

    it.effect('should handle Bearer prefix', () =>
      Effect.gen(function* () {
        const validator = createValidator()
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )
        const result = yield* validator.validate(`Bearer ${validToken}`)

        expect(result.userId).toBe(validPayload.userId)
      })
    )

    it.effect('should work with string pattern', () =>
      Effect.gen(function* () {
        const validator = createTokenValidator(secretKey, '^wss://.*\\.nearkim\\.dev$')
        const validToken = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )
        const result = yield* validator.validate(validToken)

        expect(result.userId).toBe(validPayload.userId)
      })
    )
  })

  describe('createTestToken', () => {
    it.effect('should create a verifiable token', () =>
      Effect.gen(function* () {
        const token = yield* Effect.promise(() =>
          createTestToken(validPayload, secretKey)
        )
        const validator = createValidator()
        const result = yield* validator.validate(token)

        expect(result.userId).toBe(validPayload.userId)
        expect(result.sessionId).toBe(validPayload.sessionId)
      })
    )

    it.effect('should support custom expiration', () =>
      Effect.gen(function* () {
        const token = yield* Effect.promise(() =>
          createTestToken({ ...validPayload, expiresIn: '2h' }, secretKey)
        )
        const validator = createValidator()
        const result = yield* validator.validate(token)

        expect(result.userId).toBe(validPayload.userId)
      })
    )
  })
})
