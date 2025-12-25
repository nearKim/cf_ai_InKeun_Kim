import { it, describe } from '@effect/vitest'
import { Effect, Either } from 'effect'
import { expect } from 'vitest'
import {
  parseEnvelope,
  createEnvelope,
  serializeEnvelope,
  MessageEnvelopeParseError,
} from '../validation'
import {
  createStatusMessage,
  serializeStatusMessage,
  createErrorMessage,
  queueFullError,
  invalidMessageError,
} from '../messages/index'

describe('MessageEnvelope', () => {
  describe('parseEnvelope', () => {
    it.effect('should parse valid envelope', () =>
      Effect.gen(function* () {
        const envelope = { id: 'test-id', timestamp: 1234567890, payload: 'test payload' }
        const result = yield* parseEnvelope(JSON.stringify(envelope))

        expect(result.id).toBe('test-id')
        expect(result.timestamp).toBe(1234567890)
        expect(result.payload).toBe('test payload')
      })
    )

    it.effect('should fail on invalid JSON', () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(parseEnvelope('not json'))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(MessageEnvelopeParseError)
          expect(result.left.reason).toBe('invalid_json')
        }
      })
    )

    it.effect('should fail on missing required fields', () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(parseEnvelope(JSON.stringify({ id: 'test' })))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('invalid_structure')
        }
      })
    )
  })

  describe('createEnvelope', () => {
    it('should create envelope with defaults', () => {
      const envelope = createEnvelope({ payload: 'test' })

      expect(envelope.id).toBeDefined()
      expect(envelope.timestamp).toBeGreaterThan(0)
      expect(envelope.payload).toBe('test')
    })

    it('should use provided values', () => {
      const envelope = createEnvelope({ id: 'custom-id', payload: 'test', timestamp: 1000 })

      expect(envelope.id).toBe('custom-id')
      expect(envelope.timestamp).toBe(1000)
    })
  })

  describe('serializeEnvelope', () => {
    it('should serialize to JSON', () => {
      const envelope = createEnvelope({ id: 'test', payload: 'data', timestamp: 1000 })
      const json = serializeEnvelope(envelope)
      const parsed = JSON.parse(json)

      expect(parsed.id).toBe('test')
      expect(parsed.payload).toBe('data')
    })
  })
})

describe('StatusMessage', () => {
  it('should create status message', () => {
    const status = createStatusMessage({
      protocolVersion: '1',
      homeServer: 'online',
      queueDepth: 5,
      sessionState: 'Active',
    })

    expect(status.type).toBe('status')
    expect(status.protocolVersion).toBe('1')
    expect(status.homeServer).toBe('online')
  })

  it('should serialize to JSON', () => {
    const status = createStatusMessage({
      protocolVersion: '1',
      homeServer: 'offline',
      queueDepth: 0,
      sessionState: 'Idle',
    })
    const json = serializeStatusMessage(status)
    const parsed = JSON.parse(json)

    expect(parsed.type).toBe('status')
    expect(parsed.sessionState).toBe('Idle')
  })
})

describe('ErrorMessage', () => {
  it('should create queue full error', () => {
    const error = queueFullError(30)

    expect(error.type).toBe('error')
    expect(error.code).toBe('QUEUE_FULL')
    expect(error.retryable).toBe(true)
    expect(error.retryAfter).toBe(30)
  })

  it('should create invalid message error', () => {
    const error = invalidMessageError('bad format')

    expect(error.code).toBe('INVALID_MESSAGE')
    expect(error.message).toContain('bad format')
    expect(error.retryable).toBe(false)
  })

  it('should create custom error', () => {
    const error = createErrorMessage({
      code: 'AUTH_FAILED',
      message: 'Not authorized',
      retryable: false,
    })

    expect(error.type).toBe('error')
    expect(error.code).toBe('AUTH_FAILED')
  })
})
