import {describe, test, expect, beforeEach, afterEach} from 'vitest'
import {Effect, Data, Layer} from 'effect'
import {createTestContext, type TestContext} from './testHelper'
import {CloudFlareSessionRepository} from '../repositories/CloudFlareSessionRepository'
import * as SessionIdModule from '../../domain/value-objects/SessionId'
import * as RequestIdModule from '../../domain/value-objects/RequestId'
import * as SessionAggregate from '../../domain/aggregates/Session'
import * as ClientMessageModule from '../../domain/value-objects/ClientMessage'
import type {Request} from '../../domain/aggregates/Request'
import type {RequestRepository} from '../../domain/repositories/RequestRepository'
import {EstablishSessionUseCase} from '../../application/use-cases/EstablishSessionUseCase'
import {HandleClientMessageUseCase} from '../../application/use-cases/HandleClientMessageUseCase'
import {
  RequestRepositoryTag,
  SessionRepositoryTag,
  UnitOfWorkService,
} from '../../application/services/UnitOfWorkService'

const createInMemoryRequestRepository = () => {
  const store = new Map<string, Request>()

  const toArray = (): Request[] => Array.from(store.values())

  const repository: RequestRepository = {
    save: (request) =>
      Effect.sync(() => {
        store.set(RequestIdModule.unwrap(request.requestId), request)
      }),
    findById: (id) =>
      Effect.sync(() => store.get(RequestIdModule.unwrap(id)) ?? null),
    findBySessionId: (sessionId) =>
      Effect.sync(() =>
        toArray().filter((request) => request.sessionId === sessionId)
      ),
    delete: (id) =>
      Effect.sync(() => {
        store.delete(RequestIdModule.unwrap(id))
      }),
    exists: (id) =>
      Effect.sync(() => store.has(RequestIdModule.unwrap(id))),
    countBySessionId: (sessionId) =>
      Effect.sync(() =>
        toArray().filter((request) => request.sessionId === sessionId).length
      ),
  }

  return {
    repository,
    getAll: (): Request[] => toArray(),
  }
}

describe('CloudFlareSessionRepository - Integration Tests', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('save() persists Session aggregate to storage', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const repository = new CloudFlareSessionRepository(sqlExecutor)

      const session = await Effect.runPromise(
        Effect.gen(function* () {
          const sessionId = yield* SessionIdModule.make('session-save-test')

          return Data.struct({
            sessionId,
            state: 'Active' as const,
            requestIds: [],
            establishedAt: Date.now(),
            closedAt: undefined,
            closeReason: undefined,
          })
        })
      )

      // When
      await Effect.runPromise(repository.save(session))

      // Then
      const rows = await Effect.runPromise(
        sqlExecutor.execute(
          'SELECT * FROM sessions WHERE session_id = ?',
          SessionIdModule.unwrap(session.sessionId)
        )
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]!.session_id).toBe('session-save-test')
      expect(rows[0]!.state).toBe('Active')
      expect(rows[0]!.request_ids).toBe('[]')
    })
  })

  test('findById() reconstructs Session aggregate from storage', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const repository = new CloudFlareSessionRepository(sqlExecutor)

      const sessionId = await Effect.runPromise(
        Effect.gen(function* () {
          const sessionId = yield* SessionIdModule.make('session-find-test')
          const establishedAt = Date.now()

          yield* sqlExecutor.execute(
            `INSERT INTO sessions (session_id, state, established_at, request_ids)
             VALUES (?, ?, ?, ?)`,
            SessionIdModule.unwrap(sessionId),
            'Active',
            establishedAt,
            JSON.stringify(['req-1', 'req-2'])
          )

          return sessionId
        })
      )

      // When
      const result = await Effect.runPromise(repository.findById(sessionId))

      // Then
      expect(result).not.toBeNull()
      expect(SessionIdModule.unwrap(result!.sessionId)).toBe('session-find-test')
      expect(result!.state).toBe('Active')
      expect(result!.requestIds).toHaveLength(2)
    })
  })

  test('save() and findById() roundtrip preserves aggregate', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const repository = new CloudFlareSessionRepository(sqlExecutor)

      const original = await Effect.runPromise(
        Effect.gen(function* () {
          const sessionId = yield* SessionIdModule.make('roundtrip-test')
          const requestIds = yield* Effect.all([
            RequestIdModule.make('req-alpha'),
            RequestIdModule.make('req-beta'),
            RequestIdModule.make('req-gamma'),
          ])

          return Data.struct({
            sessionId,
            state: 'Active' as const,
            requestIds,
            establishedAt: 1234567890000,
            closedAt: undefined,
            closeReason: undefined,
          })
        })
      )

      // When
      await Effect.runPromise(repository.save(original))
      const loaded = await Effect.runPromise(repository.findById(original.sessionId))

      // Then
      expect(loaded).not.toBeNull()
      expect(SessionIdModule.unwrap(loaded!.sessionId)).toBe(
        SessionIdModule.unwrap(original.sessionId)
      )
      expect(loaded!.requestIds).toHaveLength(3)
    })
  })

  test('save() persists domain transitions from establish to close', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const repository = new CloudFlareSessionRepository(sqlExecutor)

      const closedSession = await Effect.runPromise(
        Effect.gen(function* () {
          const sessionId = yield* SessionIdModule.make('session-domain-flow')
          const {session: established} = yield* SessionAggregate.establish({
            sessionId,
            timestamp: 1111,
          })
          const requestId = yield* RequestIdModule.make('req-domain-flow')
          const {session: withRequest} = yield* SessionAggregate.addRequest(
            established,
            requestId
          )
          const {session: closed} = yield* SessionAggregate.close(
            withRequest,
            'completed',
            2222
          )

          yield* repository.save(closed)

          return closed
        })
      )

      // When
      const reloaded = await Effect.runPromise(
        repository.findById(closedSession.sessionId)
      )

      // Then
      expect(reloaded).not.toBeNull()
      expect(SessionIdModule.unwrap(reloaded!.sessionId)).toBe(
        SessionIdModule.unwrap(closedSession.sessionId)
      )
      expect(reloaded!.state).toBe('Closed')
      expect(reloaded!.requestIds).toHaveLength(1)
      expect(reloaded!.closeReason).toBe('completed')
      expect(reloaded!.establishedAt).toBe(1111)
      expect(reloaded!.closedAt).toBe(2222)
    })
  })

  test('EstablishSessionUseCase persists session using repository', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const repository = new CloudFlareSessionRepository(sqlExecutor)
      const useCase = new EstablishSessionUseCase(repository)

      const sessionId = await Effect.runPromise(
        SessionIdModule.make('session-usecase-integration')
      )

      // When
      const result = await Effect.runPromise(
        useCase.execute(sessionId, 999999)
      )

      // Then
      expect(result.session.state).toBe('Active')
      expect(result.events).toHaveLength(1)

      const row = await Effect.runPromise(
        sqlExecutor.executeOne<{
          session_id: string
          established_at: number
        }>(
          'SELECT session_id, established_at FROM sessions WHERE session_id = ?',
          SessionIdModule.unwrap(sessionId)
        )
      )

      expect(row).not.toBeNull()
      expect(row!.session_id).toBe(SessionIdModule.unwrap(sessionId))
      expect(row!.established_at).toBe(999999)
    })
  })

  test('HandleClientMessageUseCase updates persisted session with request ids', async () => {
    await ctx.runInContext(async (sqlExecutor) => {
      // Given
      const sessionRepository = new CloudFlareSessionRepository(sqlExecutor)
      const {repository: requestRepository, getAll} =
        createInMemoryRequestRepository()

      const sessionId = await Effect.runPromise(
        SessionIdModule.make('session-handle-client-message')
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const {session} = yield* SessionAggregate.establish({
            sessionId,
            timestamp: 1234,
          })
          yield* sessionRepository.save(session)
        })
      )

      const message = await Effect.runPromise(
        ClientMessageModule.make({prompt: 'Hello integration'})
      )

      const repositoryLayer = Layer.mergeAll(
        Layer.succeed(SessionRepositoryTag, sessionRepository),
        Layer.succeed(RequestRepositoryTag, requestRepository)
      )
      const environment = UnitOfWorkService.Live.pipe(
        Layer.provide(repositoryLayer)
      )

      // When
      const result = await Effect.runPromise(
        new HandleClientMessageUseCase()
          .execute(sessionId, message, 4321)
          .pipe(Effect.provide(environment))
      )

      // Then
      const storedRequests = getAll()
      expect(storedRequests).toHaveLength(1)
      const storedRequest = storedRequests[0]!

      expect(result.session.requestIds).toHaveLength(1)
      expect(
        RequestIdModule.unwrap(result.session.requestIds[0]!)
      ).toBe(RequestIdModule.unwrap(storedRequest.requestId))

      const row = await Effect.runPromise(
        sqlExecutor.executeOne<{ request_ids: string }>(
          'SELECT request_ids FROM sessions WHERE session_id = ?',
          SessionIdModule.unwrap(sessionId)
        )
      )

      expect(row).not.toBeNull()
      const persistedRequestIds = JSON.parse(row!.request_ids) as string[]
      expect(persistedRequestIds).toContain(
        RequestIdModule.unwrap(storedRequest.requestId)
      )
    })
  })
})
