import {describe, test, expect, beforeEach, afterEach} from 'vitest'
import {Effect, Data} from 'effect'
import {createTestContext, type TestContext} from './testHelper'
import {CloudFlareSessionRepository} from '../repositories/CloudFlareSessionRepository'
import * as SessionIdModule from '../../domain/value-objects/SessionId'
import * as RequestIdModule from '../../domain/value-objects/RequestId'

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
})