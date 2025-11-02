import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import * as SessionId from '../../../domain/value-objects/SessionId'
import * as RequestId from '../../../domain/value-objects/RequestId'
import * as ClientMessage from '../../../domain/value-objects/ClientMessage'
import * as StreamChunk from '../../../domain/value-objects/StreamChunk'
import * as RequestAggregate from '../../../domain/aggregates/Request'
import type { Request } from '../../../domain/aggregates/Request'
import type { RequestRepository } from '../../../domain/repositories/RequestRepository'
import { RepositoryError } from '../../../domain/repositories/errors'
import { HandleStreamChunkUseCase } from '../../use-cases/HandleStreamChunkUseCase'
import {
  RequestNotFoundError,
} from '../../errors/UseCaseError'
import type { SessionRepository } from '../../../domain/repositories/SessionRepository'
import {
  UnitOfWorkService,
  RequestRepositoryTag,
  SessionRepositoryTag,
} from '../../services/UnitOfWorkService'

const createMockSessionRepository = (): SessionRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(null)),
  delete: vi.fn(() => Effect.succeed(void 0)),
  exists: vi.fn(() => Effect.succeed(false)),
})

const createMockRequestRepository = (
  requestToReturn?: Request | null
): RequestRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(requestToReturn ?? null)),
  findBySessionId: vi.fn(() => Effect.succeed([])),
  delete: vi.fn(() => Effect.succeed(void 0)),
  exists: vi.fn(() => Effect.succeed(false)),
  countBySessionId: vi.fn(() => Effect.succeed(0)),
})

const createTestLayer = (
  sessionRepo: SessionRepository,
  requestRepo: RequestRepository
) => {
  const repoLayer = Layer.mergeAll(
    Layer.succeed(SessionRepositoryTag, sessionRepo),
    Layer.succeed(RequestRepositoryTag, requestRepo)
  )
  return UnitOfWorkService.Live.pipe(Layer.provide(repoLayer))
}

describe('HandleStreamChunkUseCase', () => {
  let mockSessionRepository: SessionRepository
  let mockRequestRepository: RequestRepository
  let streamingRequest: Request
  let testLayer: Layer.Layer<UnitOfWorkService>

  beforeEach(() => {
    const sessionId = Effect.runSync(SessionId.generate())
    const requestId = Effect.runSync(RequestId.generate())
    const message = Effect.runSync(ClientMessage.make({ prompt: 'Test' }))

    // Create request in Pending state
    const { request } = Effect.runSync(
      RequestAggregate.create({ requestId, sessionId, message })
    )

    // Transition to Streaming state by adding a chunk
    const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
    const { request: requestWithChunk } = Effect.runSync(
      RequestAggregate.addChunk(request, deltaChunk)
    )
    streamingRequest = requestWithChunk

    mockSessionRepository = createMockSessionRepository()
    mockRequestRepository = createMockRequestRepository(streamingRequest)
    testLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
  })

  describe('Successful execution', () => {
    it('should add delta chunk to streaming request', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta(' World'))

      //When
      const result = Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.requestId).toBe(streamingRequest.requestId)
      expect(result.state).toBe('Streaming')
      expect(result.chunks).toHaveLength(2) // Original + new chunk
      expect(result.chunks[1]).toEqual(deltaChunk)
    })

    it('should add complete chunk to streaming request', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const completeChunk = StreamChunk.makeComplete(100)

      //When
      const result = Effect.runSync(
        useCase
          .execute({
            requestId: streamingRequest.requestId,
            chunk: completeChunk,
          })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[1]).toEqual(completeChunk)
    })

    it('should add error chunk to streaming request', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const errorChunk = Effect.runSync(
        StreamChunk.makeError('Something went wrong')
      )

      //When
      const result = Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: errorChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[1]).toEqual(errorChunk)
    })

    it('should save updated request', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta(' World'))

      //When
      Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
    })

    it('should return updated request with chunk added', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta(' World'))

      //When
      const result = Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.requestId).toBe(streamingRequest.requestId)
      expect(result.chunks.length).toBeGreaterThan(streamingRequest.chunks.length)
    })
  })

  describe('Request not found', () => {
    it('should fail when request does not exist', () => {
      //Given
      mockRequestRepository = createMockRequestRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const requestId = Effect.runSync(RequestId.generate())
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When & Then
      expect(() =>
        Effect.runSync(
          useCase
            .execute({ requestId, chunk: deltaChunk })
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should return RequestNotFoundError', () => {
      //Given
      mockRequestRepository = createMockRequestRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const requestId = Effect.runSync(RequestId.generate())
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When
      const result = useCase
        .execute({ requestId, chunk: deltaChunk })
        .pipe(Effect.provide(customLayer))

      //Then
      const either = Effect.runSync(Effect.either(result))
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('RequestNotFoundError')
      }
    })
  })

  describe('Invalid request state', () => {
    it('should fail when request is in Completed state', () => {
      //Given
      const { request: completedRequest } = Effect.runSync(
        RequestAggregate.complete(streamingRequest)
      )
      mockRequestRepository = createMockRequestRepository(completedRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When & Then
      expect(() =>
        Effect.runSync(
          useCase
            .execute({ requestId: completedRequest.requestId, chunk: deltaChunk })
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should fail when request is in Failed state', () => {
      //Given
      const { request: failedRequest } = Effect.runSync(
        RequestAggregate.fail(streamingRequest, 'Test error')
      )
      mockRequestRepository = createMockRequestRepository(failedRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When & Then
      expect(() =>
        Effect.runSync(
          useCase
            .execute({ requestId: failedRequest.requestId, chunk: deltaChunk })
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should return InvalidRequestStateError with correct states', () => {
      //Given
      const { request: completedRequest } = Effect.runSync(
        RequestAggregate.complete(streamingRequest)
      )
      mockRequestRepository = createMockRequestRepository(completedRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When
      const result = useCase
        .execute({ requestId: completedRequest.requestId, chunk: deltaChunk })
        .pipe(Effect.provide(customLayer))

      //Then
      const either = Effect.runSync(Effect.either(result))
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('UseCaseExecutionError')
        // The domain InvalidRequestStateError gets wrapped
      }
    })
  })

  describe('Repository failures', () => {
    it('should handle requestRepository.findById error', () => {
      //Given
      const repositoryError = new RepositoryError({
        operation: 'findById',
        message: 'Database connection failed',
      })
      mockRequestRepository.findById = vi.fn(() => Effect.fail(repositoryError))
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When & Then
      expect(() =>
        Effect.runSync(
          useCase
            .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should handle requestRepository.save error', () => {
      //Given
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockRequestRepository.save = vi.fn(() => Effect.fail(repositoryError))
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When & Then
      expect(() =>
        Effect.runSync(
          useCase
            .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
            .pipe(Effect.provide(testLayer))
        )
      ).toThrow()
    })
  })

  describe('Verification', () => {
    it('should call requestRepository.findById with correct requestId', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When
      Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockRequestRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.findById).toHaveBeenCalledWith(
        streamingRequest.requestId
      )
    })

    it('should call requestRepository.save with updated request', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta(' World'))

      //When
      const result = Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: streamingRequest.requestId,
          chunks: result.chunks,
        })
      )
    })

    it('should call repository methods exactly once', () => {
      //Given
      const useCase = new HandleStreamChunkUseCase()
      const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Test'))

      //When
      Effect.runSync(
        useCase
          .execute({ requestId: streamingRequest.requestId, chunk: deltaChunk })
          .pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockRequestRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
    })
  })
})
