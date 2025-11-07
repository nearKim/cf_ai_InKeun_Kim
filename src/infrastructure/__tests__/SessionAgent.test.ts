import {beforeEach, describe, expect, test} from 'vitest'
import {Agent} from '@cloudflare/agents'
import {env, runInDurableObject} from 'cloudflare:test'
import type {DurableObjectStub} from '@cloudflare/workers-types'
import {Effect} from 'effect'
import {createSqlExecutor} from '../database/sqlExecutor'

interface EstablishPayload {
  readonly action: 'establish'
  readonly sessionId: string
  readonly timestamp: number
}

describe('SessionAgent integration', () => {
  let stub: DurableObjectStub

  beforeEach(async () => {
    const id = env.SESSIONS.idFromName('agent-' + Math.random())
    stub = env.SESSIONS.get(id)

    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAll()
    })
  })

  test('SessionAgent extends Cloudflare Agent base class', async () => {
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeInstanceOf(Agent)
    })
  })

  test('establish action persists session through repository', async () => {
    const payload: EstablishPayload = {
      action: 'establish',
      sessionId: 'agent-session-123',
      timestamp: 2468,
    }

    const response = await stub.fetch('https://example.com/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(201)
    const data = (await response.json()) as {sessionId: string; establishedAt: number}
    expect(data.sessionId).toBe(payload.sessionId)
    expect(data.establishedAt).toBe(payload.timestamp)

    await runInDurableObject(stub, async (_instance, state) => {
      const sqlExecutor = createSqlExecutor(state.storage.sql)
      const row = await Effect.runPromise(
        sqlExecutor.executeOne<{
          session_id: string
          established_at: number
        }>(
          'SELECT session_id, established_at FROM sessions WHERE session_id = ?',
          payload.sessionId
        )
      )

      expect(row).not.toBeNull()
      expect(row!.session_id).toBe(payload.sessionId)
      expect(row!.established_at).toBe(payload.timestamp)
    })
  })
})