import { describe, it, expect } from 'vitest'
import { Effect, Equal } from 'effect'
import * as SessionId from '../../value-objects/SessionId'
import * as RequestId from '../../value-objects/RequestId'
import * as ClientMessage from '../../value-objects/ClientMessage'
import * as StreamChunk from '../../value-objects/StreamChunk'
import * as DomainEvent from '../DomainEvent'
import * as Constructors from '../constructors'
import * as Matchers from '../matchers'

describe('DomainEvent', () => {
  describe('SessionEstablished', () => {
    it('should create a SessionEstablished event with auto timestamp', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const before = Date.now()

      //When
      const event = Constructors.makeSessionEstablished({ sessionId })

      //Then
      expect(event._tag).toBe('SessionEstablished')
      expect(event.sessionId).toBe(sessionId)
      expect(event.timestamp).toBeGreaterThanOrEqual(before)
      expect(event.timestamp).toBeLessThanOrEqual(Date.now())
    })

    it('should create a SessionEstablished event with custom timestamp', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const customTimestamp = 1234567890000

      //When
      const event = Constructors.makeSessionEstablished({
        sessionId,
        timestamp: customTimestamp,
      })

      //Then
      expect(event.timestamp).toBe(customTimestamp)
    })
  })

  describe('RequestReceived', () => {
    it('should create a RequestReceived event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(ClientMessage.make({ prompt: 'Hello' }))

      //When
      const event = Constructors.makeRequestReceived({
        requestId,
        sessionId,
        message,
      })

      //Then
      expect(event._tag).toBe('RequestReceived')
      expect(event.requestId).toBe(requestId)
      expect(event.sessionId).toBe(sessionId)
      expect(event.message).toBe(message)
      expect(event.timestamp).toBeGreaterThan(0)
    })
  })

  describe('ResponseChunkReceived', () => {
    it('should create a ResponseChunkReceived event with Delta chunk', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))

      //When
      const event = Constructors.makeResponseChunkReceived({
        requestId,
        chunk,
      })

      //Then
      expect(event._tag).toBe('ResponseChunkReceived')
      expect(event.requestId).toBe(requestId)
      expect(event.chunk).toBe(chunk)
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('should create a ResponseChunkReceived event with Complete chunk', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const chunk = StreamChunk.makeComplete(1500)

      //When
      const event = Constructors.makeResponseChunkReceived({
        requestId,
        chunk,
      })

      //Then
      expect(event._tag).toBe('ResponseChunkReceived')
      expect(event.chunk).toBe(chunk)
    })
  })

  describe('RequestCompleted', () => {
    it('should create a RequestCompleted event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())

      //When
      const event = Constructors.makeRequestCompleted({ requestId })

      //Then
      expect(event._tag).toBe('RequestCompleted')
      expect(event.requestId).toBe(requestId)
      expect(event.timestamp).toBeGreaterThan(0)
    })
  })

  describe('RequestFailed', () => {
    it('should create a RequestFailed event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const error = 'Connection timeout'

      //When
      const event = Constructors.makeRequestFailed({ requestId, error })

      //Then
      expect(event._tag).toBe('RequestFailed')
      expect(event.requestId).toBe(requestId)
      expect(event.error).toBe(error)
      expect(event.timestamp).toBeGreaterThan(0)
    })
  })

  describe('Pattern Matching', () => {
    it('should match SessionEstablished events', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const event = Constructors.makeSessionEstablished({ sessionId })

      //When
      const result = Matchers.matchEvent({
        SessionEstablished: (e) => `Session: ${SessionId.unwrap(e.sessionId)}`,
        RequestReceived: () => 'Request received',
        ResponseChunkReceived: () => 'Chunk received',
        RequestCompleted: () => 'Completed',
        RequestFailed: () => 'Failed',
      })(event)

      //Then
      expect(result).toContain('Session:')
      expect(result).toContain(SessionId.unwrap(sessionId))
    })

    it('should match RequestReceived events', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(ClientMessage.make({ prompt: 'Test' }))
      const event = Constructors.makeRequestReceived({
        requestId,
        sessionId,
        message,
      })

      //When
      const result = Matchers.matchEvent({
        SessionEstablished: () => 'Session',
        RequestReceived: (e) => `Request: ${ClientMessage.getPrompt(e.message)}`,
        ResponseChunkReceived: () => 'Chunk',
        RequestCompleted: () => 'Completed',
        RequestFailed: () => 'Failed',
      })(event)

      //Then
      expect(result).toBe('Request: Test')
    })

    it('should match ResponseChunkReceived events', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const event = Constructors.makeResponseChunkReceived({
        requestId,
        chunk,
      })

      //When
      const result = Matchers.matchEvent({
        SessionEstablished: () => 'Session',
        RequestReceived: () => 'Request',
        ResponseChunkReceived: (e) =>
          e.chunk._tag === 'Delta' ? `Delta: ${e.chunk.content}` : 'Other',
        RequestCompleted: () => 'Completed',
        RequestFailed: () => 'Failed',
      })(event)

      //Then
      expect(result).toBe('Delta: Hello')
    })

    it('should match RequestCompleted events', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const event = Constructors.makeRequestCompleted({ requestId })

      //When
      const result = Matchers.matchEvent({
        SessionEstablished: () => 'Session',
        RequestReceived: () => 'Request',
        ResponseChunkReceived: () => 'Chunk',
        RequestCompleted: () => 'Done',
        RequestFailed: () => 'Failed',
      })(event)

      //Then
      expect(result).toBe('Done')
    })

    it('should match RequestFailed events', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const event = Constructors.makeRequestFailed({
        requestId,
        error: 'Timeout',
      })

      //When
      const result = Matchers.matchEvent({
        SessionEstablished: () => 'Session',
        RequestReceived: () => 'Request',
        ResponseChunkReceived: () => 'Chunk',
        RequestCompleted: () => 'Done',
        RequestFailed: (e) => `Error: ${e.error}`,
      })(event)

      //Then
      expect(result).toBe('Error: Timeout')
    })
  })

  describe('Equality', () => {
    it('should compare SessionEstablished events correctly', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const timestamp = Date.now()
      const event1 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp,
      })
      const event2 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp,
      })

      //When & Then
      expect(Equal.equals(event1, event2)).toBe(true)
    })

    it('should detect different timestamps', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const event1 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp: 1000,
      })
      const event2 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp: 2000,
      })

      //When & Then
      expect(Equal.equals(event1, event2)).toBe(false)
    })

    it('should detect different event types', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const event1 = Constructors.makeRequestCompleted({ requestId })
      const event2 = Constructors.makeRequestFailed({
        requestId,
        error: 'Error',
      })

      //When & Then
      expect(Equal.equals(event1, event2)).toBe(false)
    })
  })

  describe('Immutability', () => {
    it('should create independent event instances', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const event1 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp: 1000,
      })
      const event2 = Constructors.makeSessionEstablished({
        sessionId,
        timestamp: 2000,
      })

      //Then
      expect(event1).not.toBe(event2)
      expect(event1.timestamp).toBe(1000)
      expect(event2.timestamp).toBe(2000)
    })
  })
})
