import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import type * as EffectType from 'effect/Effect'
import * as SessionId from '../../../domain/value-objects/SessionId'
import * as RequestId from '../../../domain/value-objects/RequestId'
import * as ClientMessage from '../../../domain/value-objects/ClientMessage'
import * as SessionAggregate from '../../../domain/aggregates/Session'
import type { Session } from '../../../domain/aggregates/Session'
import type { SessionRepository } from '../../../domain/repositories/SessionRepository'
import type { RequestRepository } from '../../../domain/repositories/RequestRepository'
import { RepositoryError } from '../../../domain/repositories/errors'
import {
  HandleClientMessageUseCase,
} from '../../use-cases/HandleClientMessageUseCase'
import {
  SessionNotFoundError,
  SessionNotActiveError,
} from '../../errors/UseCaseError'
import {
  UnitOfWorkService,
  SessionRepositoryTag,
  RequestRepositoryTag,
} from '../../services/UnitOfWorkService'

const createMockSessionRepository = (
  sessionToReturn?: Session | null
): SessionRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(sessionToReturn ?? null)),
  delete: vi.fn(() => Effect.succeed(void 0)),
  exists: vi.fn(() => Effect.succeed(false)),
})

const createMockRequestRepository = (): RequestRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(null)),
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

const createCustomUnitOfWorkLayer = (
  sessionRepo: SessionRepository,
  requestRepo: RequestRepository,
  commit: () => EffectType.Effect<void, any>,
  rollback: () => EffectType.Effect<void, any>
) => {
  return Layer.succeed(UnitOfWorkService, {
    begin: () =>
      Effect.succeed({
        sessionRepository: sessionRepo,
        requestRepository: requestRepo,
        commit,
        rollback,
      }),
  })
}

describe('HandleClientMessageUseCase', () => {
  let mockSessionRepository: SessionRepository
  let mockRequestRepository: RequestRepository
  let activeSession: Session
  let testLayer: Layer.Layer<UnitOfWorkService>

  beforeEach(() => {
    const sessionId = Effect.runSync(SessionId.generate())
    const { session } = Effect.runSync(
      SessionAggregate.establish({ sessionId })
    )
    activeSession = session

    mockSessionRepository = createMockSessionRepository(activeSession)
    mockRequestRepository = createMockRequestRepository()

    testLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
  })

  describe('Successful execution', () => {
    it('should create request and add to session', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.request).toBeDefined()
      expect(result.request.sessionId).toBe(activeSession.sessionId)
      expect(result.request.message).toBe(message)
      expect(result.request.state).toBe('Pending')
    })

    it('should save both session and request', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))

      //Then
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
    })

    it('should return session, request, and all events', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.session).toBeDefined()
      expect(result.request).toBeDefined()
      expect(result.events).toBeDefined()
      expect(result.events.length).toBeGreaterThan(0)
    })

    it('should emit RequestReceived event', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      const requestReceivedEvent = result.events.find(
        (e) => e._tag === 'RequestReceived'
      )
      expect(requestReceivedEvent).toBeDefined()
      if (requestReceivedEvent && requestReceivedEvent._tag === 'RequestReceived') {
        expect(requestReceivedEvent.sessionId).toBe(activeSession.sessionId)
        expect(requestReceivedEvent.message).toBe(message)
      }
    })

    it('should add requestId to session', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.session.requestIds).toHaveLength(1)
      expect(result.session.requestIds[0]).toBe(result.request.requestId)
    })

    it('should use provided timestamp', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )
      const customTimestamp = 1234567890000

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message, customTimestamp).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(result.request.receivedAt).toBe(customTimestamp)
    })
  })

  describe('Session not found', () => {
    it('should fail when session does not exist', () => {
      //Given
      mockSessionRepository = createMockSessionRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleClientMessageUseCase()
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then
      expect(() => Effect.runSync(useCase.execute(sessionId, message).pipe(Effect.provide(customLayer)))).toThrow()
    })

    it('should return SessionNotFoundError', () => {
      //Given
      mockSessionRepository = createMockSessionRepository(null)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleClientMessageUseCase()
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = useCase.execute(sessionId, message).pipe(Effect.provide(customLayer))

      //Then
      const either = Effect.runSync(Effect.either(result))
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('SessionNotFoundError')
      }
    })
  })

  describe('Session not active', () => {
    it('should fail when session is closed', () => {
      //Given
      const { session: closedSession } = Effect.runSync(
        SessionAggregate.close(activeSession)
      )
      mockSessionRepository = createMockSessionRepository(closedSession)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then
      expect(() =>
        Effect.runSync(useCase.execute(closedSession.sessionId, message).pipe(Effect.provide(customLayer)))
      ).toThrow()
    })

    it('should return SessionNotActiveError', () => {
      //Given
      const { session: closedSession } = Effect.runSync(
        SessionAggregate.close(activeSession)
      )
      mockSessionRepository = createMockSessionRepository(closedSession)
      const customLayer = createTestLayer(mockSessionRepository, mockRequestRepository)
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = useCase.execute(closedSession.sessionId, message).pipe(Effect.provide(customLayer))

      //Then
      const either = Effect.runSync(Effect.either(result))
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('SessionNotActiveError')
        if (either.left._tag === 'SessionNotActiveError') {
          expect(either.left.currentState).toBe('Closed')
        }
      }
    })
  })

  describe('Repository failures', () => {
    it('should handle session repository findById error', () => {
      //Given
      const repositoryError = new RepositoryError({
        operation: 'findById',
        message: 'Database connection failed',
      })
      mockSessionRepository.findById = vi.fn(() =>
        Effect.fail(repositoryError)
      )
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then
      expect(() =>
        Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))
      ).toThrow()
    })

    it('should handle request repository save error', () => {
      //Given
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockRequestRepository.save = vi.fn(() => Effect.fail(repositoryError))
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then
      expect(() =>
        Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))
      ).toThrow()
    })

    it('should handle session repository save error', () => {
      //Given
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockSessionRepository.save = vi.fn(() => Effect.fail(repositoryError))
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then
      expect(() =>
        Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))
      ).toThrow()
    })
  })

  describe('Verification', () => {
    it('should call sessionRepository.findById with correct sessionId', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))

      //Then
      expect(mockSessionRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockSessionRepository.findById).toHaveBeenCalledWith(
        activeSession.sessionId
      )
    })

    it('should call requestRepository.save with created request', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: result.request.requestId,
          sessionId: activeSession.sessionId,
          message: message,
        })
      )
    })

    it('should call sessionRepository.save with updated session', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer))
      )

      //Then
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(1)
      expect(mockSessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: activeSession.sessionId,
          requestIds: expect.arrayContaining([result.request.requestId]),
        })
      )
    })

    it('should call both repositories exactly once', () => {
      //Given
      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      Effect.runSync(useCase.execute(activeSession.sessionId, message).pipe(Effect.provide(testLayer)))

      //Then
      expect(mockSessionRepository.findById).toHaveBeenCalledTimes(1)
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(1)
    })
  })

  describe('Transaction Semantics', () => {
    it('should commit transaction on successful execution', () => {
      //Given
      const mockCommit = vi.fn(() => Effect.void)
      const mockRollback = vi.fn(() => Effect.void)

      mockSessionRepository = createMockSessionRepository(activeSession)
      mockRequestRepository = createMockRequestRepository()

      const customLayer = createCustomUnitOfWorkLayer(
        mockSessionRepository,
        mockRequestRepository,
        mockCommit,
        mockRollback
      )

      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      Effect.runSync(
        useCase.execute(activeSession.sessionId, message).pipe(
          Effect.provide(customLayer)
        )
      )

      //Then
      expect(mockCommit).toHaveBeenCalledTimes(1)
      expect(mockRollback).not.toHaveBeenCalled()
    })

    it('should rollback transaction on validation error', () => {
      //Given
      const mockCommit = vi.fn(() => Effect.void)
      const mockRollback = vi.fn(() => Effect.void)

      mockSessionRepository = createMockSessionRepository(null)
      mockRequestRepository = createMockRequestRepository()

      const customLayer = createCustomUnitOfWorkLayer(
        mockSessionRepository,
        mockRequestRepository,
        mockCommit,
        mockRollback
      )

      const useCase = new HandleClientMessageUseCase()
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = useCase
        .execute(sessionId, message)
        .pipe(Effect.provide(customLayer))

      //Then
      Effect.runSync(Effect.either(result))
      expect(mockCommit).not.toHaveBeenCalled()
      expect(mockRollback).toHaveBeenCalledTimes(1)
    })

    it('should rollback transaction on repository error', () => {
      //Given
      const mockCommit = vi.fn(() => Effect.void)
      const mockRollback = vi.fn(() => Effect.void)

      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockSessionRepository = createMockSessionRepository(activeSession)
      mockRequestRepository = createMockRequestRepository()
      mockRequestRepository.save = vi.fn(() => Effect.fail(repositoryError))

      const customLayer = createCustomUnitOfWorkLayer(
        mockSessionRepository,
        mockRequestRepository,
        mockCommit,
        mockRollback
      )

      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = useCase
        .execute(activeSession.sessionId, message)
        .pipe(Effect.provide(customLayer))

      //Then
      Effect.runSync(Effect.either(result))
      expect(mockCommit).not.toHaveBeenCalled()
      expect(mockRollback).toHaveBeenCalledTimes(1)
    })

    it('should handle commit failure gracefully', () => {
      //Given
      const commitError = { _tag: 'TransactionError' as const, message: 'Commit failed' }
      const mockCommit = vi.fn(() => Effect.fail(commitError))
      const mockRollback = vi.fn(() => Effect.void)

      mockSessionRepository = createMockSessionRepository(activeSession)
      mockRequestRepository = createMockRequestRepository()

      const customLayer = createCustomUnitOfWorkLayer(
        mockSessionRepository,
        mockRequestRepository,
        mockCommit,
        mockRollback
      )

      const useCase = new HandleClientMessageUseCase()
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When & Then - Should not throw
      expect(() =>
        Effect.runSync(
          useCase.execute(activeSession.sessionId, message).pipe(
            Effect.provide(customLayer)
          )
        )
      ).not.toThrow()

      expect(mockCommit).toHaveBeenCalledTimes(1)
    })

    it('should handle rollback failure gracefully', () => {
      //Given
      const rollbackError = { _tag: 'TransactionError' as const, message: 'Rollback failed' }
      const mockCommit = vi.fn(() => Effect.void)
      const mockRollback = vi.fn(() => Effect.fail(rollbackError))

      mockSessionRepository = createMockSessionRepository(null)
      mockRequestRepository = createMockRequestRepository()

      const customLayer = createCustomUnitOfWorkLayer(
        mockSessionRepository,
        mockRequestRepository,
        mockCommit,
        mockRollback
      )

      const useCase = new HandleClientMessageUseCase()
      const sessionId = Effect.runSync(SessionId.generate())
      const message = Effect.runSync(
        ClientMessage.make({ prompt: 'Hello AI' })
      )

      //When
      const result = useCase
        .execute(sessionId, message)
        .pipe(Effect.provide(customLayer))

      //Then - Should handle gracefully and return domain error
      const either = Effect.runSync(Effect.either(result))
      expect(either._tag).toBe('Left')
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('SessionNotFoundError')
      }
      expect(mockRollback).toHaveBeenCalledTimes(1)
    })
  })
})
