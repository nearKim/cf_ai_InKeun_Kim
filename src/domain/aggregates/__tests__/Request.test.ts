import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as SessionId from '../../value-objects/SessionId'
import * as RequestId from '../../value-objects/RequestId'
import * as ClientMessage from '../../value-objects/ClientMessage'
import * as StreamChunk from '../../value-objects/StreamChunk'
import * as Request from '../Request'

describe('Request Aggregate', () => {
  describe('create', () => {
    it('should create a new Request in Pending state', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )

      //Then
      expect(result.request.requestId).toBe(requestId)
      expect(result.request.sessionId).toBe(sessionId)
      expect(result.request.message).toBe(message)
      expect(result.request.state).toBe('Pending')
      expect(result.request.chunks).toEqual([])
      expect(result.request.receivedAt).toBeGreaterThan(0)
      expect(result.request.completedAt).toBeUndefined()
      expect(result.request.failureReason).toBeUndefined()
    })

    it('should emit RequestReceived event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('RequestReceived')
      if (event._tag === 'RequestReceived') {
        expect(event.requestId).toBe(requestId)
        expect(event.sessionId).toBe(sessionId)
        expect(event.message).toBe(message)
      }
    })
  })

  describe('addChunk', () => {
    it('should transition from Pending to Streaming on first Delta chunk', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))

      //When
      const result = Effect.runSync(Request.addChunk(request, chunk))

      //Then
      expect(result.request.state).toBe('Streaming')
      expect(result.request.chunks).toHaveLength(1)
      expect(result.request.chunks[0]).toBe(chunk)
    })

    it('should emit ResponseChunkReceived event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))

      //When
      const result = Effect.runSync(Request.addChunk(request, chunk))

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('ResponseChunkReceived')
      if (event._tag === 'ResponseChunkReceived') {
        expect(event.requestId).toBe(requestId)
        expect(event.chunk).toBe(chunk)
      }
    })

    it('should accumulate multiple chunks in Streaming state', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk1)
      )
      const chunk2 = Effect.runSync(StreamChunk.makeDelta(' world'))

      //When
      const result = Effect.runSync(Request.addChunk(request2, chunk2))

      //Then
      expect(result.request.state).toBe('Streaming')
      expect(result.request.chunks).toHaveLength(2)
      expect(result.request.chunks[0]).toBe(chunk1)
      expect(result.request.chunks[1]).toBe(chunk2)
    })

    it('should fail when adding chunk to Completed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: completedRequest } = Effect.runSync(
        Request.complete(request2)
      )
      const newChunk = Effect.runSync(StreamChunk.makeDelta('More'))

      //When & Then
      expect(() =>
        Effect.runSync(Request.addChunk(completedRequest, newChunk))
      ).toThrow()
    })

    it('should fail when adding chunk to Failed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: failedRequest } = Effect.runSync(
        Request.fail(request2, 'Connection timeout')
      )
      const newChunk = Effect.runSync(StreamChunk.makeDelta('More'))

      //When & Then
      expect(() =>
        Effect.runSync(Request.addChunk(failedRequest, newChunk))
      ).toThrow()
    })
  })

  describe('complete', () => {
    it('should transition from Streaming to Completed', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: streamingRequest } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )

      //When
      const result = Effect.runSync(Request.complete(streamingRequest))

      //Then
      expect(result.request.state).toBe('Completed')
      expect(result.request.completedAt).toBeGreaterThan(0)
    })

    it('should emit RequestCompleted event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: streamingRequest } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )

      //When
      const result = Effect.runSync(Request.complete(streamingRequest))

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('RequestCompleted')
      if (event._tag === 'RequestCompleted') {
        expect(event.requestId).toBe(requestId)
      }
    })

    it('should fail when completing Pending request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )

      //When & Then
      expect(() => Effect.runSync(Request.complete(request))).toThrow()
    })

    it('should fail when completing already Completed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: completedRequest } = Effect.runSync(
        Request.complete(request2)
      )

      //When & Then
      expect(() => Effect.runSync(Request.complete(completedRequest))).toThrow()
    })

    it('should fail when completing Failed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: failedRequest } = Effect.runSync(
        Request.fail(request2, 'Error')
      )

      //When & Then
      expect(() => Effect.runSync(Request.complete(failedRequest))).toThrow()
    })
  })

  describe('fail', () => {
    it('should transition from Streaming to Failed', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: streamingRequest } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const errorMessage = 'Connection timeout'

      //When
      const result = Effect.runSync(
        Request.fail(streamingRequest, errorMessage)
      )

      //Then
      expect(result.request.state).toBe('Failed')
      expect(result.request.failureReason).toBe(errorMessage)
      expect(result.request.completedAt).toBeGreaterThan(0)
    })

    it('should emit RequestFailed event', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: streamingRequest } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const errorMessage = 'Connection timeout'

      //When
      const result = Effect.runSync(
        Request.fail(streamingRequest, errorMessage)
      )

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('RequestFailed')
      if (event._tag === 'RequestFailed') {
        expect(event.requestId).toBe(requestId)
        expect(event.error).toBe(errorMessage)
      }
    })

    it('should allow failing Pending request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const errorMessage = 'Validation failed'

      //When
      const result = Effect.runSync(Request.fail(request, errorMessage))

      //Then
      expect(result.request.state).toBe('Failed')
      expect(result.request.failureReason).toBe(errorMessage)
    })

    it('should fail when failing already Completed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: completedRequest } = Effect.runSync(
        Request.complete(request2)
      )

      //When & Then
      expect(() =>
        Effect.runSync(Request.fail(completedRequest, 'Error'))
      ).toThrow()
    })

    it('should fail when failing already Failed request', () => {
      //Given
      const requestId = Effect.runSync(RequestId.generate())
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const { request: request1 } = Effect.runSync(
        Request.create({ requestId, sessionId, message })
      )
      const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
      const { request: request2 } = Effect.runSync(
        Request.addChunk(request1, chunk)
      )
      const { request: failedRequest } = Effect.runSync(
        Request.fail(request2, 'First error')
      )

      //When & Then
      expect(() =>
        Effect.runSync(Request.fail(failedRequest, 'Second error'))
      ).toThrow()
    })
  })

  describe('Queries', () => {
    describe('isCompleted', () => {
      it('should return true for Completed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk)
        )
        const { request: completedRequest } = Effect.runSync(
          Request.complete(request2)
        )

        //When & Then
        expect(Request.isCompleted(completedRequest)).toBe(true)
      })

      it('should return false for non-Completed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )

        //When & Then
        expect(Request.isCompleted(request)).toBe(false)
      })
    })

    describe('isFailed', () => {
      it('should return true for Failed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk)
        )
        const { request: failedRequest } = Effect.runSync(
          Request.fail(request2, 'Error')
        )

        //When & Then
        expect(Request.isFailed(failedRequest)).toBe(true)
      })

      it('should return false for non-Failed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )

        //When & Then
        expect(Request.isFailed(request)).toBe(false)
      })
    })

    describe('canAcceptChunks', () => {
      it('should return true for Pending request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )

        //When & Then
        expect(Request.canAcceptChunks(request)).toBe(true)
      })

      it('should return true for Streaming request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: streamingRequest } = Effect.runSync(
          Request.addChunk(request1, chunk)
        )

        //When & Then
        expect(Request.canAcceptChunks(streamingRequest)).toBe(true)
      })

      it('should return false for Completed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk)
        )
        const { request: completedRequest } = Effect.runSync(
          Request.complete(request2)
        )

        //When & Then
        expect(Request.canAcceptChunks(completedRequest)).toBe(false)
      })

      it('should return false for Failed request', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk)
        )
        const { request: failedRequest } = Effect.runSync(
          Request.fail(request2, 'Error')
        )

        //When & Then
        expect(Request.canAcceptChunks(failedRequest)).toBe(false)
      })
    })

    describe('getChunks', () => {
      it('should return all chunks', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk1)
        )
        const chunk2 = Effect.runSync(StreamChunk.makeDelta(' world'))
        const { request: request3 } = Effect.runSync(
          Request.addChunk(request2, chunk2)
        )

        //When
        const chunks = Request.getChunks(request3)

        //Then
        expect(chunks).toHaveLength(2)
        expect(chunks[0]).toBe(chunk1)
        expect(chunks[1]).toBe(chunk2)
      })
    })

    describe('getFullResponse', () => {
      it('should concatenate all Delta chunks', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk1)
        )
        const chunk2 = Effect.runSync(StreamChunk.makeDelta(' world'))
        const { request: request3 } = Effect.runSync(
          Request.addChunk(request2, chunk2)
        )
        const chunk3 = Effect.runSync(StreamChunk.makeDelta('!'))
        const { request: request4 } = Effect.runSync(
          Request.addChunk(request3, chunk3)
        )

        //When
        const fullResponse = Request.getFullResponse(request4)

        //Then
        expect(fullResponse).toBe('Hello world!')
      })

      it('should return empty string for request with no chunks', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )

        //When
        const fullResponse = Request.getFullResponse(request)

        //Then
        expect(fullResponse).toBe('')
      })

      it('should ignore non-Delta chunks', () => {
        //Given
        const requestId = Effect.runSync(RequestId.generate())
        const sessionId = Effect.runSync(SessionId.generate())
        const message = Effect.runSync(
          ClientMessage.make({ prompt: 'Hello AI' })
        )
        const { request: request1 } = Effect.runSync(
          Request.create({ requestId, sessionId, message })
        )
        const chunk1 = Effect.runSync(StreamChunk.makeDelta('Hello'))
        const { request: request2 } = Effect.runSync(
          Request.addChunk(request1, chunk1)
        )
        const chunk2 = StreamChunk.makeComplete(1000)
        const { request: request3 } = Effect.runSync(
          Request.addChunk(request2, chunk2)
        )

        //When
        const fullResponse = Request.getFullResponse(request3)

        //Then
        expect(fullResponse).toBe('Hello')
      })
    })
  })
})
