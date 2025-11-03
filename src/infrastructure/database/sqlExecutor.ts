import { Effect, Data } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { SqlStorage, SqlStorageValue, SqlStorageCursor } from '@cloudflare/workers-types/experimental'

/**
 * Re-export CloudFlare types for convenience
 */
export type { SqlStorage, SqlStorageValue, SqlStorageCursor }

export class SqlExecutionError extends Data.TaggedError('SqlExecutionError')<{
  readonly message: string
  readonly query: string
  readonly cause?: unknown
}> {}

export interface SqlExecutor {
  execute<T extends Record<string, SqlStorageValue> = Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: any[]
  ): EffectType.Effect<T[], SqlExecutionError>

  executeOne<T extends Record<string, SqlStorageValue> = Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: any[]
  ): EffectType.Effect<T | null, SqlExecutionError>
}

export const createSqlExecutor = (sql: SqlStorage): SqlExecutor => {
  return {
    execute: <T extends Record<string, SqlStorageValue> = Record<string, SqlStorageValue>>(
      query: string,
      ...bindings: any[]
    ): EffectType.Effect<T[], SqlExecutionError> =>
      Effect.try({
        try: () => {
          const cursor = sql.exec<T>(query, ...bindings)
          return cursor.toArray()
        },
        catch: (error) =>
          new SqlExecutionError({
            message:
              error instanceof Error ? error.message : String(error),
            query,
            cause: error,
          }),
      }),

    executeOne: <T extends Record<string, SqlStorageValue> = Record<string, SqlStorageValue>>(
      query: string,
      ...bindings: any[]
    ): EffectType.Effect<T | null, SqlExecutionError> =>
      Effect.try({
        try: () => {
          const cursor = sql.exec<T>(query, ...bindings)
          const result = cursor.one()
          return result || null
        },
        catch: (error) =>
          new SqlExecutionError({
            message:
              error instanceof Error ? error.message : String(error),
            query,
            cause: error,
          }),
      }),
  }
}
