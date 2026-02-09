import { Effect } from 'effect'
import { QueueFullError, QueueOperationError } from '../errors'

export type QueuedMessage = {
  readonly id: string
  readonly envelopeJson: string
  readonly queuedAt: number
}

export interface MessageQueueService {
  readonly enqueue: (
    id: string,
    rawJson: string,
    limit: number
  ) => Effect.Effect<void, QueueFullError | QueueOperationError>
  readonly dequeue: (id: string) => Effect.Effect<void, QueueOperationError>
  readonly getAll: () => Effect.Effect<readonly QueuedMessage[], QueueOperationError>
  readonly count: () => Effect.Effect<number, QueueOperationError>
  readonly clear: () => Effect.Effect<void, QueueOperationError>
  readonly ensureSchema: () => Effect.Effect<void, QueueOperationError>
}

type SqlExecutor = <T>(strings: TemplateStringsArray, ...values: unknown[]) => T[]

type MessageQueueRow = {
  id: string
  envelope_json: string
  queued_at: number
}

export const createMessageQueueService = (sql: SqlExecutor): MessageQueueService => ({
  enqueue: (id, rawJson, limit) =>
    Effect.gen(function* () {
      const countResult = yield* Effect.try({
        try: () => {
          const rows = sql<{ count: number }>`SELECT COUNT(*) as count FROM message_queue`
          return rows[0]?.count ?? 0
        },
        catch: (error) =>
          new QueueOperationError({
            operation: 'count',
            message: 'Failed to count queued messages',
            cause: error,
          }),
      })

      if (countResult >= limit) {
        return yield* Effect.fail(
          new QueueFullError({ limit, currentCount: countResult, retryAfter: 60 })
        )
      }

      yield* Effect.try({
        try: () => {
          sql`
            INSERT INTO message_queue (id, envelope_json, queued_at)
            VALUES (${id}, ${rawJson}, ${Date.now()})
          `
        },
        catch: (error) =>
          new QueueOperationError({
            operation: 'insert',
            message: 'Failed to enqueue message',
            cause: error,
          }),
      })
    }),

  dequeue: (id) =>
    Effect.try({
      try: () => {
        sql`DELETE FROM message_queue WHERE id = ${id}`
      },
      catch: (error) =>
        new QueueOperationError({
          operation: 'delete',
          message: `Failed to dequeue message ${id}`,
          cause: error,
        }),
    }),

  getAll: () =>
    Effect.try({
      try: () => {
        const rows = sql<MessageQueueRow>`
          SELECT id, envelope_json, queued_at
          FROM message_queue
          ORDER BY queued_at ASC
        `
        return rows.map((row) => ({
          id: row.id,
          envelopeJson: row.envelope_json,
          queuedAt: row.queued_at,
        }))
      },
      catch: (error) =>
        new QueueOperationError({
          operation: 'select',
          message: 'Failed to get queued messages',
          cause: error,
        }),
    }),

  count: () =>
    Effect.try({
      try: () => {
        const rows = sql<{ count: number }>`SELECT COUNT(*) as count FROM message_queue`
        return rows[0]?.count ?? 0
      },
      catch: (error) =>
        new QueueOperationError({
          operation: 'count',
          message: 'Failed to count queued messages',
          cause: error,
        }),
    }),

  clear: () =>
    Effect.try({
      try: () => {
        sql`DELETE FROM message_queue`
      },
      catch: (error) =>
        new QueueOperationError({
          operation: 'clear',
          message: 'Failed to clear queue',
          cause: error,
        }),
    }),

  ensureSchema: () =>
    Effect.try({
      try: () => {
        sql`
          CREATE TABLE IF NOT EXISTS message_queue (
            id TEXT PRIMARY KEY,
            envelope_json TEXT NOT NULL,
            queued_at INTEGER NOT NULL
          )
        `
      },
      catch: (error) =>
        new QueueOperationError({
          operation: 'insert',
          message: 'Failed to create schema',
          cause: error,
        }),
    }),
})
