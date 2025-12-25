import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Effect } from 'effect'
import * as MessageEnvelope from '../MessageEnvelope'

describe('MessageEnvelope', () => {
  describe('parse', () => {
    it('should parse valid envelope JSON', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        timestamp: 1234567890,
        payload: '{"content": "hello"}',
      })

      const result = await Effect.runPromise(MessageEnvelope.parse(raw))

      expect(result.id).toBe('msg-123')
      expect(result.timestamp).toBe(1234567890)
      expect(result.payload).toBe('{"content": "hello"}')
    })

    it('should fail with invalid_json when JSON is invalid', async () => {
      const raw = 'not-valid-json'

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_json')
        expect(result.left._tag).toBe('MessageEnvelopeParseError')
      }
    })

    it('should fail with invalid_structure when id is missing', async () => {
      const raw = JSON.stringify({
        timestamp: 1234567890,
        payload: '{}',
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should fail with invalid_structure when id is empty string', async () => {
      const raw = JSON.stringify({
        id: '',
        timestamp: 1234567890,
        payload: '{}',
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should fail with invalid_structure when timestamp is missing', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        payload: '{}',
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should fail with invalid_structure when timestamp is zero or negative', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        timestamp: 0,
        payload: '{}',
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should fail with invalid_structure when payload is missing', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        timestamp: 1234567890,
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should fail with invalid_structure when payload is not a string', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        timestamp: 1234567890,
        payload: { nested: 'object' },
      })

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(MessageEnvelope.MessageEnvelopeParseError)
        expect(result.left.reason).toBe('invalid_structure')
      }
    })

    it('should accept empty string as valid payload', async () => {
      const raw = JSON.stringify({
        id: 'msg-123',
        timestamp: 1234567890,
        payload: '',
      })

      const result = await Effect.runPromise(MessageEnvelope.parse(raw))

      expect(result.payload).toBe('')
    })

    it('should preserve cause in error for debugging', async () => {
      const raw = 'not-valid-json'

      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.cause).toBeDefined()
      }
    })
  })

  describe('create', () => {
    let mockRandomUUID: ReturnType<typeof vi.spyOn>
    let mockDateNow: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      mockRandomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid-123')
      mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(9999999999)
    })

    afterEach(() => {
      mockRandomUUID.mockRestore()
      mockDateNow.mockRestore()
    })

    it('should create envelope with provided values', () => {
      const envelope = MessageEnvelope.create({
        id: 'custom-id',
        payload: '{"data": "test"}',
        timestamp: 1234567890,
      })

      expect(envelope.id).toBe('custom-id')
      expect(envelope.payload).toBe('{"data": "test"}')
      expect(envelope.timestamp).toBe(1234567890)
    })

    it('should generate UUID when id not provided', () => {
      const envelope = MessageEnvelope.create({
        payload: '{"data": "test"}',
        timestamp: 1234567890,
      })

      expect(envelope.id).toBe('mock-uuid-123')
    })

    it('should use current timestamp when not provided', () => {
      const envelope = MessageEnvelope.create({
        id: 'msg-123',
        payload: '{"data": "test"}',
      })

      expect(envelope.timestamp).toBe(9999999999)
    })

    it('should generate both id and timestamp when not provided', () => {
      const envelope = MessageEnvelope.create({
        payload: '{}',
      })

      expect(envelope.id).toBe('mock-uuid-123')
      expect(envelope.timestamp).toBe(9999999999)
    })

    it('should create immutable struct via Data.struct', () => {
      const envelope = MessageEnvelope.create({
        id: 'test-id',
        payload: '{}',
        timestamp: 1000,
      })

      // Data.struct creates frozen objects
      expect(Object.isFrozen(envelope)).toBe(true)
    })
  })

  describe('serialize', () => {
    it('should serialize envelope to JSON string', () => {
      const envelope: MessageEnvelope.MessageEnvelope = {
        id: 'msg-123',
        timestamp: 1234567890,
        payload: '{"content": "hello"}',
      }

      const serialized = MessageEnvelope.serialize(envelope)
      const parsed = JSON.parse(serialized)

      expect(parsed.id).toBe('msg-123')
      expect(parsed.timestamp).toBe(1234567890)
      expect(parsed.payload).toBe('{"content": "hello"}')
    })

    it('should produce valid JSON that can be re-parsed', async () => {
      const original: MessageEnvelope.MessageEnvelope = {
        id: 'msg-456',
        timestamp: 9876543210,
        payload: '{"key": "value"}',
      }

      const serialized = MessageEnvelope.serialize(original)
      const reparsed = await Effect.runPromise(MessageEnvelope.parse(serialized))

      expect(reparsed.id).toBe(original.id)
      expect(reparsed.timestamp).toBe(original.timestamp)
      expect(reparsed.payload).toBe(original.payload)
    })
  })

  describe('round-trip', () => {
    it('should preserve envelope through create -> serialize -> parse cycle', async () => {
      const original = MessageEnvelope.create({
        id: 'round-trip-id',
        payload: '{"nested": {"data": true}}',
        timestamp: 1500000000,
      })

      const serialized = MessageEnvelope.serialize(original)
      const reparsed = await Effect.runPromise(MessageEnvelope.parse(serialized))

      expect(reparsed.id).toBe(original.id)
      expect(reparsed.timestamp).toBe(original.timestamp)
      expect(reparsed.payload).toBe(original.payload)
    })
  })

  describe('MessageEnvelopeParseError', () => {
    it('should have correct _tag for pattern matching', async () => {
      const raw = 'invalid'
      const result = await Effect.runPromise(Effect.either(MessageEnvelope.parse(raw)))

      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('MessageEnvelopeParseError')
      }
    })

    it('should support Effect error handling patterns', async () => {
      const raw = 'invalid'

      const handled = await Effect.runPromise(
        MessageEnvelope.parse(raw).pipe(
          Effect.catchTag('MessageEnvelopeParseError', (error) =>
            Effect.succeed({ fallback: true, reason: error.reason })
          )
        )
      )

      expect(handled).toEqual({ fallback: true, reason: 'invalid_json' })
    })
  })
})
