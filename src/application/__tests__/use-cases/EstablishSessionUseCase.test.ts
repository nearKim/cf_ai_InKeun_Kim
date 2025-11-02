import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'
import * as SessionId from '../../../domain/value-objects/SessionId'
import type { SessionRepository } from '../../../domain/repositories/SessionRepository'
import { RepositoryError } from '../../../domain/repositories/errors'
import { EstablishSessionUseCase } from '../../use-cases/EstablishSessionUseCase'

const createMockRepository = (): SessionRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(null)),
  delete: vi.fn(() => Effect.succeed(void 0)),
  exists: vi.fn(() => Effect.succeed(false)),
})

describe('EstablishSessionUseCase', () => {
  let mockRepository: SessionRepository
  let useCase: EstablishSessionUseCase

  beforeEach(() => {
    mockRepository = createMockRepository()
    useCase = new EstablishSessionUseCase(mockRepository)
  })

  describe('Successful execution', () => {
    it('should establish session and save to repository', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(useCase.execute(sessionId))

      //Then
      expect(result.session.sessionId).toBe(sessionId)
      expect(result.session.state).toBe('Active')
      expect(mockRepository.save).toHaveBeenCalledTimes(1)
    })

    it('should return session and events', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(useCase.execute(sessionId))

      //Then
      expect(result.session).toBeDefined()
      expect(result.events).toHaveLength(1)
      expect(result.events[0]!._tag).toBe('SessionEstablished')
    })

    it('should emit SessionEstablished event', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(useCase.execute(sessionId))

      //Then
      const event = result.events[0]!
      expect(event._tag).toBe('SessionEstablished')
      if (event._tag === 'SessionEstablished') {
        expect(event.sessionId).toBe(sessionId)
        expect(event.timestamp).toBeGreaterThan(0)
      }
    })

    it('should use provided timestamp', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const customTimestamp = 1234567890000

      //When
      const result = Effect.runSync(
        useCase.execute(sessionId, customTimestamp)
      )

      //Then
      expect(result.session.establishedAt).toBe(customTimestamp)
      const event = result.events[0]!
      if (event._tag === 'SessionEstablished') {
        expect(event.timestamp).toBe(customTimestamp)
      }
    })

    it('should use current timestamp when not provided', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const before = Date.now()

      //When
      const result = Effect.runSync(useCase.execute(sessionId))

      //Then
      const after = Date.now()
      expect(result.session.establishedAt).toBeGreaterThanOrEqual(before)
      expect(result.session.establishedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('Repository failures', () => {
    it('should handle repository save error', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockRepository.save = vi.fn(() => Effect.fail(repositoryError))

      //When & Then
      expect(() => Effect.runSync(useCase.execute(sessionId))).toThrow()
    })

    it('should convert RepositoryError to UseCaseExecutionError', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const repositoryError = new RepositoryError({
        operation: 'save',
        message: 'Storage failure',
      })
      mockRepository.save = vi.fn(() => Effect.fail(repositoryError))

      //When
      const result = useCase.execute(sessionId)

      //Then
      const either = Effect.runSync(Effect.either(result))
      if (either._tag === 'Left') {
        expect(either.left._tag).toBe('UseCaseExecutionError')
        if (either.left._tag === 'UseCaseExecutionError') {
          expect(either.left.useCase).toBe('EstablishSessionUseCase')
          expect(either.left.operation).toBe('execute')
          expect(either.left.cause).toBe(repositoryError)
        }
      }
    })
  })

  describe('Verification', () => {
    it('should call repository.save with correct session', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(useCase.execute(sessionId))

      //Then
      expect(mockRepository.save).toHaveBeenCalledTimes(1)
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: sessionId,
          state: 'Active',
        })
      )
    })

    it('should call Session.establish with correct parameters', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const customTimestamp = 1234567890000

      //When
      const result = Effect.runSync(
        useCase.execute(sessionId, customTimestamp)
      )

      //Then
      expect(result.session.sessionId).toBe(sessionId)
      expect(result.session.establishedAt).toBe(customTimestamp)
    })
  })
})
