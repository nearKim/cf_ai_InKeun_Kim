import { describe, it, expect, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  UnitOfWorkService,
  SessionRepositoryTag,
  RequestRepositoryTag,
} from '../UnitOfWorkService'
import type { SessionRepository } from '../../../domain/repositories/SessionRepository'
import type { RequestRepository } from '../../../domain/repositories/RequestRepository'

const createMockSessionRepository = (): SessionRepository => ({
  save: vi.fn(() => Effect.succeed(void 0)),
  findById: vi.fn(() => Effect.succeed(null)),
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

const createTestLayer = () => {
  const mockSessionRepo = createMockSessionRepository()
  const mockRequestRepo = createMockRequestRepository()

  const repoLayer = Layer.mergeAll(
    Layer.succeed(SessionRepositoryTag, mockSessionRepo),
    Layer.succeed(RequestRepositoryTag, mockRequestRepo)
  )

  return UnitOfWorkService.Live.pipe(Layer.provide(repoLayer))
}

describe('UnitOfWorkService', () => {
  describe('Transaction lifecycle', () => {
    it('should begin transaction and return UnitOfWork with repositories', () => {
      const program = Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        const uow = yield* service.begin()

        expect(uow.sessionRepository).toBeDefined()
        expect(uow.requestRepository).toBeDefined()
        expect(uow.commit).toBeDefined()
        expect(uow.rollback).toBeDefined()
      }).pipe(Effect.provide(createTestLayer()))

      Effect.runSync(program)
    })

    it('should commit successfully', () => {
      const program = Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        const uow = yield* service.begin()

        yield* uow.commit()
      }).pipe(Effect.provide(createTestLayer()))

      expect(() => Effect.runSync(program)).not.toThrow()
    })

    it('should rollback successfully', () => {
      const program = Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        const uow = yield* service.begin()

        yield* uow.rollback()
      }).pipe(Effect.provide(createTestLayer()))

      expect(() => Effect.runSync(program)).not.toThrow()
    })
  })

  describe('Repository access', () => {
    it('should provide working SessionRepository instance', () => {
      const program = Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        const uow = yield* service.begin()

        expect(uow.sessionRepository.save).toBeDefined()
        expect(uow.sessionRepository.findById).toBeDefined()
        expect(uow.sessionRepository.delete).toBeDefined()
        expect(uow.sessionRepository.exists).toBeDefined()
      }).pipe(Effect.provide(createTestLayer()))

      Effect.runSync(program)
    })

    it('should provide working RequestRepository instance', () => {
      const program = Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        const uow = yield* service.begin()

        expect(uow.requestRepository.save).toBeDefined()
        expect(uow.requestRepository.findById).toBeDefined()
        expect(uow.requestRepository.findBySessionId).toBeDefined()
        expect(uow.requestRepository.delete).toBeDefined()
        expect(uow.requestRepository.exists).toBeDefined()
        expect(uow.requestRepository.countBySessionId).toBeDefined()
      }).pipe(Effect.provide(createTestLayer()))

      Effect.runSync(program)
    })
  })
})
