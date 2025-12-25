import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  createTokenValidationService,
  createTestToken,
  AuthenticationError,
  type TokenPayload,
} from '../TokenValidationService'

describe('TokenValidationService', () => {
  const secretKey = 'test-secret'
  const allowedPattern = /^wss:\/\/.*\.nearkim\.dev$/

  const createService = () => createTokenValidationService(secretKey, allowedPattern)

  const validPayload: TokenPayload = {
    userId: 'user-123',
    sessionId: 'session-456',
    homeServerUrl: 'wss://api.nearkim.dev',
    expiresAt: Date.now() + 3600000, // 1 hour from now
  }

  describe('Missing token', () => {
    it('should fail when token is null', async () => {
      const service = createService()

      const result = await Effect.runPromise(Effect.either(service.validate(null)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(AuthenticationError)
        expect(result.left.reason).toBe('missing_token')
      }
    })

    it('should fail when token is empty string', async () => {
      const service = createService()

      const result = await Effect.runPromise(Effect.either(service.validate('')))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('missing_token')
      }
    })

    it('should fail when token is whitespace only', async () => {
      const service = createService()

      const result = await Effect.runPromise(Effect.either(service.validate('   ')))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('missing_token')
      }
    })
  })

  describe('Invalid token format', () => {
    it('should fail when token is not valid base64', async () => {
      const service = createService()

      const result = await Effect.runPromise(Effect.either(service.validate('not-valid-base64!!!')))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('invalid_token')
      }
    })

    it('should fail when token contains invalid JSON', async () => {
      const service = createService()
      const invalidToken = btoa('not-json')

      const result = await Effect.runPromise(Effect.either(service.validate(invalidToken)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('invalid_token')
      }
    })

    it('should fail when token is missing required fields', async () => {
      const service = createService()
      const incompleteToken = btoa(JSON.stringify({ userId: 'user-123' }))

      const result = await Effect.runPromise(Effect.either(service.validate(incompleteToken)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('invalid_token')
        expect(result.left.message).toContain('missing required fields')
      }
    })
  })

  describe('Token expiration', () => {
    it('should fail when token is expired', async () => {
      const service = createService()
      const expiredPayload = {
        ...validPayload,
        expiresAt: Date.now() - 1000, // 1 second ago
      }
      const expiredToken = createTestToken(expiredPayload)

      const result = await Effect.runPromise(Effect.either(service.validate(expiredToken)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('expired_token')
      }
    })
  })

  describe('Home server URL validation', () => {
    it('should fail when home server URL does not match allowed pattern', async () => {
      const service = createService()
      const invalidUrlPayload = {
        ...validPayload,
        homeServerUrl: 'wss://malicious.example.com',
      }
      const token = createTestToken(invalidUrlPayload)

      const result = await Effect.runPromise(Effect.either(service.validate(token)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.reason).toBe('invalid_home_server_url')
      }
    })

    it('should accept valid home server URL matching pattern', async () => {
      const service = createService()
      const token = createTestToken(validPayload)

      const result = await Effect.runPromise(Effect.either(service.validate(token)))

      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right.homeServerUrl).toBe(validPayload.homeServerUrl)
      }
    })
  })

  describe('Successful validation', () => {
    it('should return payload when token is valid', async () => {
      const service = createService()
      const token = createTestToken(validPayload)

      const result = await Effect.runPromise(service.validate(token))

      expect(result.userId).toBe(validPayload.userId)
      expect(result.sessionId).toBe(validPayload.sessionId)
      expect(result.homeServerUrl).toBe(validPayload.homeServerUrl)
      expect(result.expiresAt).toBe(validPayload.expiresAt)
    })

    it('should handle Bearer prefix', async () => {
      const service = createService()
      const token = createTestToken(validPayload)
      const bearerToken = `Bearer ${token}`

      const result = await Effect.runPromise(service.validate(bearerToken))

      expect(result.userId).toBe(validPayload.userId)
    })

    it('should work with string pattern', () => {
      const service = createTokenValidationService(secretKey, '^wss://.*\\.nearkim\\.dev$')
      const token = createTestToken(validPayload)

      const result = Effect.runSync(service.validate(token))

      expect(result.userId).toBe(validPayload.userId)
    })
  })

  describe('createTestToken', () => {
    it('should create a decodable token', () => {
      const token = createTestToken(validPayload)
      const decoded = JSON.parse(atob(token))

      expect(decoded.userId).toBe(validPayload.userId)
      expect(decoded.sessionId).toBe(validPayload.sessionId)
      expect(decoded.homeServerUrl).toBe(validPayload.homeServerUrl)
      expect(decoded.expiresAt).toBe(validPayload.expiresAt)
    })
  })
})
