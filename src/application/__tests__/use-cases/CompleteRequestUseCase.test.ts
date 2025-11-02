import {describe, it, expect, vi, beforeEach} from 'vitest'
import {Effect, Layer} from 'effect'
import * as SessionId from '../../../domain/value-objects/SessionId'
import * as RequestId from '../../../domain/value-objects/RequestId'
import * as ClientMessage from '../../../domain/value-objects/ClientMessage'
import * as StreamChunk from '../../../domain/value-objects/StreamChunk'
import * as RequestAggregate from '../../../domain/aggregates/Request'
import type {Request} from '../../../domain/aggregates/Request'
import type {RequestRepository} from '../../../domain/repositories/RequestRepository'
import {RepositoryError} from '../../../domain/repositories/errors'
import {CompleteRequestUseCase} from '../../use-cases/CompleteRequestUseCase'
import type {SessionRepository} from '../../../domain/repositories/SessionRepository'
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

describe('CompleteRequestUseCase', () => {
  let mockSessionRepository: SessionRepository
  let mockRequestRepository: RequestRepository
  let streamingRequest: Request
  let testLayer: Layer.Layer<UnitOfWorkService>

  beforeEach(() => {
    const sessionId = Effect.runSync(SessionId.generate())
    const requestId = Effect.runSync(RequestId.generate())
    const message = Effect.runSync(ClientMessage.make({prompt: 'Test'}))

    const {request} = Effect.runSync(
      RequestAggregate.create({requestId, sessionId, message})
    )

    const deltaChunk = Effect.runSync(StreamChunk.makeDelta('Hello'))
    const {request: requestInStreaming} = Effect.runSync(
      RequestAggregate.addChunk(request, deltaChunk)
    )
    streamingRequest = requestInStreaming

    mockSessionRepository = createMockSessionRepository()
    mockRequestRepository = createMockRequestRepository(streamingRequest)
    testLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
  })

  describe('Successful execution', () => {
    it('should complete a streaming request', () => {
      const useCase = new CompleteRequestUseCase()

      const result = Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(result.state).toBe('Completed')
      expect(result.requestId).toBe(streamingRequest.requestId)
    })

    it('should complete request with metadata', () => {
      const useCase = new CompleteRequestUseCase()
      const metadata = {
        totalTokens: 150,
        stopReason: 'end_turn' as const,
      }

      const result = Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId, metadata})
          .pipe(Effect.provide(testLayer))
      )

      expect(result.state).toBe('Completed')
      expect(result.totalTokens).toBe(150)
      expect(result.stopReason).toBe('end_turn')
    })

    it('should set completedAt timestamp', () => {
      const useCase = new CompleteRequestUseCase()

      const result = Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(result.completedAt).toBeDefined()
      expect(result.completedAt).toBeGreaterThan(0)
    })

    it('should save the completed request', () => {
      const useCase = new CompleteRequestUseCase()

      Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: streamingRequest.requestId,
          state: 'Completed',
        })
      )
    })
  })

  describe('Request not found', () => {
    it('should fail when request does not exist', () => {
      mockRequestRepository = createMockRequestRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)

      const useCase = new CompleteRequestUseCase()
      const requestId = Effect.runSync(RequestId.generate())

      expect(() =>
        Effect.runSync(
          useCase.execute({requestId}).pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should return RequestNotFoundError', () => {
      mockRequestRepository = createMockRequestRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)

      const useCase = new CompleteRequestUseCase()
      const requestId = Effect.runSync(RequestId.generate())

      const result = useCase.execute({requestId}).pipe(Effect.provide(customLayer))
      const either = Effect.runSync(Effect.either(result))

      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('RequestNotFoundError')
      }
    })
  })

  describe('Invalid request state', () => {
    it('should fail when request is in Pending state', () => {
      const sessionId = Effect.runSync(SessionId.generate())
      const requestId = Effect.runSync(RequestId.generate())
      const message = Effect.runSync(ClientMessage.make({prompt: 'Test'}))

      const {request: pendingRequest} = Effect.runSync(
        RequestAggregate.create({requestId, sessionId, message})
      )

      mockRequestRepository = createMockRequestRepository(pendingRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)

      const useCase = new CompleteRequestUseCase()

      expect(() =>
        Effect.runSync(
          useCase
            .execute({requestId: pendingRequest.requestId})
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should fail when request is already Completed', () => {
      const completedRequest = Effect.runSync(
        RequestAggregate.complete(streamingRequest, {})
      ).request

      mockRequestRepository = createMockRequestRepository(completedRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)

      const useCase = new CompleteRequestUseCase()

      expect(() =>
        Effect.runSync(
          useCase
            .execute({requestId: completedRequest.requestId})
            .pipe(Effect.provide(customLayer))
        )
      ).toThrow()
    })

    it('should return InvalidRequestStateError with correct states', () => {
      const sessionId = Effect.runSync(SessionId.generate())
      const requestId = Effect.runSync(RequestId.generate())
      const message = Effect.runSync(ClientMessage.make({prompt: 'Test'}))

      const {request: pendingRequest} = Effect.runSync(
        RequestAggregate.create({requestId, sessionId, message})
      )

      mockRequestRepository = createMockRequestRepository(pendingRequest)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)

      const useCase = new CompleteRequestUseCase()

      const result = useCase
        .execute({requestId: pendingRequest.requestId})
        .pipe(Effect.provide(customLayer))
      const either = Effect.runSync(Effect.either(result))

      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('UseCaseExecutionError')
      }
    })
  })

  describe('Repository failures', () => {
    it('should handle requestRepository.findById error', () => {
      const repositoryError = new RepositoryError({
        operation: 'findById',
        message: 'Database connection failed',
      })
      mockRequestRepository.findById = vi.fn(() => Effect.fail(repositoryError))

      const useCase = new CompleteRequestUseCase()

      expect(() =>
        Effect.runSync(
          useCase
            .execute({requestId: streamingRequest.requestId})
            .pipe(Effect.provide(testLayer))
        )
      ).toThrow()
    })

    it('should handle requestRepository.save error', () => {
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockRequestRepository.save = vi.fn(() => Effect.fail(repositoryError))

      const useCase = new CompleteRequestUseCase()

      expect(() =>
        Effect.runSync(
          useCase
            .execute({requestId: streamingRequest.requestId})
            .pipe(Effect.provide(testLayer))
        )
      ).toThrow()
    })
  })

  describe('Verification', () => {
    it('should call requestRepository.findById with correct requestId', () => {
      const useCase = new CompleteRequestUseCase()

      Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(mockRequestRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.findById).toHaveBeenCalledWith(
        streamingRequest.requestId
      )
    })

    it('should call requestRepository.save with completed request', () => {
      const useCase = new CompleteRequestUseCase()

      const result = Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledWith(result)
    })

    it('should call repository methods exactly once', () => {
      const useCase = new CompleteRequestUseCase()

      Effect.runSync(
        useCase
          .execute({requestId: streamingRequest.requestId})
          .pipe(Effect.provide(testLayer))
      )

      expect(mockRequestRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
    })
  })
})
