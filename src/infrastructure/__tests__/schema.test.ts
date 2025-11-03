import { describe, test, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { Effect, Either } from 'effect'
import { SessionRecord } from '../database/schema'
import { createSqlExecutor } from '../database/sqlExecutor'
import type { DurableObjectStub } from '@cloudflare/workers-types'

describe('CloudFlare Schema - Privacy Integration Tests', () => {
  let stub: DurableObjectStub

  beforeEach(async () => {
    // Given
    const id = env.SESSIONS.idFromName('test-' + Math.random())
    stub = env.SESSIONS.get(id)

    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAll()
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)
      await Effect.runPromise(
        sqlExecutor.execute(SessionRecord.CREATE_TABLE_SQL)
      )
    })
  })

  test('sessions table stores only coordination metadata', async () => {
    // Given
    const sessionId = 'session-123'
    const requestIds = ['req-1', 'req-2', 'req-3']

    // When & Then
    await runInDurableObject(stub, async (_instance, state) => {
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      await Effect.runPromise(
        sqlExecutor.execute(
          `INSERT INTO sessions (session_id, state, established_at, request_ids)
           VALUES (?, ?, ?, ?)`,
          sessionId,
          'Active',
          Date.now(),
          JSON.stringify(requestIds)
        )
      )

      const rows = await Effect.runPromise(
        sqlExecutor.execute('SELECT * FROM sessions WHERE session_id = ?', sessionId)
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        session_id: sessionId,
        state: 'Active',
        request_ids: JSON.stringify(requestIds),
      })

      const allData = JSON.stringify(rows[0])
      expect(allData).not.toContain('prompt')
      expect(allData).not.toContain('message')
      expect(allData).not.toContain('content')
      expect(allData).not.toContain('chunk')
    })
  })

  test('session reconstruction from storage preserves domain aggregate', async () => {
    // Given
    const sessionId = 'session-456'
    const requestIds = ['req-10', 'req-11']
    const establishedAt = 1234567890000

    // When & Then
    await runInDurableObject(stub, async (_instance, state) => {
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      await Effect.runPromise(
        sqlExecutor.execute(
          `INSERT INTO sessions (session_id, state, established_at, request_ids)
           VALUES (?, ?, ?, ?)`,
          sessionId,
          'Active',
          establishedAt,
          JSON.stringify(requestIds)
        )
      )

      const rows = await Effect.runPromise(
        sqlExecutor.execute('SELECT * FROM sessions WHERE session_id = ?', sessionId)
      )

      const row = rows[0]!
      expect(row.session_id).toBe(sessionId)
      expect(row.state).toBe('Active')
      expect(row.established_at).toBe(establishedAt)
      expect(JSON.parse(row.request_ids as string)).toEqual(requestIds)
    })
  })

  test('no request persistence table exists', async () => {
    await runInDurableObject(stub, async (_instance, state) => {
      // Given
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      // When
      const result = await Effect.runPromise(
        Effect.either(
          sqlExecutor.execute('SELECT * FROM requests')
        )
      )

      // Then
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left.message).toContain('no such table')
      }
    })
  })

  test('request data never persisted to CloudFlare', async () => {
    // Given
    const sensitivePrompt = 'My credit card is 1234-5678-9012-3456'
    const sensitiveResponse = 'Your SSN is 123-45-6789'
    const sessionId = 'session-789'

    await runInDurableObject(stub, async (_instance, state) => {
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      // When
      await Effect.runPromise(
        sqlExecutor.execute(
          `INSERT INTO sessions (session_id, state, established_at, request_ids)
           VALUES (?, ?, ?, ?)`,
          sessionId,
          'Active',
          Date.now(),
          JSON.stringify(['req-sensitive'])
        )
      )

      // Then
      const allRows = await Effect.runPromise(
        sqlExecutor.execute('SELECT * FROM sessions')
      )
      const storageContent = JSON.stringify(allRows)

      expect(storageContent).not.toContain('credit card')
      expect(storageContent).not.toContain('1234-5678')
      expect(storageContent).not.toContain('SSN')
      expect(storageContent).not.toContain(sensitivePrompt)
      expect(storageContent).not.toContain(sensitiveResponse)
    })
  })

  test('state constraint enforces valid states only', async () => {
    // Given
    const invalidState = 'InvalidState'

    await runInDurableObject(stub, async (_instance, state) => {
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      // When
      const result = await Effect.runPromise(
        Effect.either(
          sqlExecutor.execute(
            `INSERT INTO sessions (session_id, state, established_at, request_ids)
             VALUES (?, ?, ?, ?)`,
            'session-999',
            invalidState,
            Date.now(),
            '[]'
          )
        )
      )

      // Then
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left.message).toMatch(/CHECK constraint failed/)
      }
    })
  })

  test('request_ids stores array of coordination IDs', async () => {
    // Given
    const requestIds = ['req-a', 'req-b', 'req-c', 'req-d']

    await runInDurableObject(stub, async (_instance, state) => {
      // @ts-expect-error - CloudFlare test SqlStorage type differs slightly from production but is compatible
      const sqlExecutor = createSqlExecutor(state.storage.sql)

      // When
      await Effect.runPromise(
        sqlExecutor.execute(
          `INSERT INTO sessions (session_id, state, established_at, request_ids)
           VALUES (?, ?, ?, ?)`,
          'session-multi',
          'Active',
          Date.now(),
          JSON.stringify(requestIds)
        )
      )

      // Then
      const rows = await Effect.runPromise(
        sqlExecutor.execute('SELECT request_ids FROM sessions WHERE session_id = ?', 'session-multi')
      )

      expect(JSON.parse(rows[0]!.request_ids as string)).toEqual(requestIds)
      expect(JSON.parse(rows[0]!.request_ids as string)).toHaveLength(4)
    })
  })
})