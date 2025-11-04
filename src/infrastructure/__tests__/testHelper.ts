import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createSqlExecutor } from '../database/sqlExecutor'
import type { SqlExecutor, SqlStorage } from '../database/sqlExecutor'
import { SessionRecord } from '../database/schema'
import { Effect } from 'effect'

export interface TestContext {
  readonly stub: DurableObjectStub
  readonly runInContext: <T>(fn: (sqlExecutor: SqlExecutor) => Promise<T>) => Promise<T>
  readonly cleanup: () => Promise<void>
}

export const createTestContext = async (): Promise<TestContext> => {
  const id = env.SESSIONS.idFromName('test-' + Math.random())
  const stub = env.SESSIONS.get(id)

  // Initialize schema
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.deleteAll()
    const sqlExecutor = createSqlExecutor(state.storage.sql)
    await Effect.runPromise(
      sqlExecutor.execute(SessionRecord.CREATE_TABLE_SQL)
    )
  })

  // Return context that provides access to the stub
  return {
    stub,
    runInContext: async <T>(fn: (sqlExecutor: SqlExecutor) => Promise<T>): Promise<T> => {
      let result!: T
      await runInDurableObject(stub, async (_instance, state) => {
        const sqlExecutor = createSqlExecutor(state.storage.sql)
        result = await fn(sqlExecutor)
      })
      return result
    },
    cleanup: async () => {
      await runInDurableObject(stub, async (_instance, state) => {
        await state.storage.deleteAll()
      })
    },
  }
}