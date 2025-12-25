import { it, describe } from '@effect/vitest'
import { Effect, Either, Exit } from 'effect'
import { expect, beforeEach, vi } from 'vitest'
import { createMessageQueueService, type MessageQueueService } from '../../../services'
import { createEnvelope, type MessageEnvelope } from '../../../validation'
import { QueueFullError, QueueOperationError } from '../../../errors'

type MockRow = Record<string, unknown>

const createMockSql = () => {
  const data: Map<string, MockRow> = new Map()
  let schemaCreated = false

  const mockSql = vi.fn(<T>(strings: TemplateStringsArray, ...values: unknown[]): T[] => {
    const query = strings.join('?')

    if (query.includes('CREATE TABLE')) {
      schemaCreated = true
      return [] as T[]
    }

    if (query.includes('SELECT COUNT')) {
      return [{ count: data.size }] as T[]
    }

    if (query.includes('INSERT INTO')) {
      const [id, envelopeJson, queuedAt] = values
      data.set(id as string, {
        id,
        envelope_json: envelopeJson,
        queued_at: queuedAt,
      })
      return [] as T[]
    }

    if (query.includes('DELETE') && query.includes('WHERE id')) {
      const [id] = values
      data.delete(id as string)
      return [] as T[]
    }

    if (query.includes('DELETE FROM message_queue') && !query.includes('WHERE')) {
      data.clear()
      return [] as T[]
    }

    if (query.includes('SELECT id')) {
      const rows = Array.from(data.values())
        .sort((a, b) => (a.queued_at as number) - (b.queued_at as number))
      return rows as T[]
    }

    return [] as T[]
  })

  return {
    sql: mockSql,
    getData: () => data,
    isSchemaCreated: () => schemaCreated,
    clear: () => data.clear(),
  }
}

describe('MessageQueueService', () => {
  let mockSql: ReturnType<typeof createMockSql>
  let service: MessageQueueService

  beforeEach(() => {
    mockSql = createMockSql()
    service = createMessageQueueService(mockSql.sql)
  })

  const createTestEnvelope = (id?: string): MessageEnvelope =>
    createEnvelope({ id: id ?? crypto.randomUUID(), payload: 'test' })

  describe('ensureSchema', () => {
    it.effect('should create table', () =>
      Effect.gen(function* () {
        yield* service.ensureSchema()
        expect(mockSql.isSchemaCreated()).toBe(true)
      })
    )

    it.effect('should handle SQL errors', () =>
      Effect.gen(function* () {
        const failingSql = vi.fn(() => {
          throw new Error('SQL error')
        })
        const failingService = createMessageQueueService(failingSql)

        const result = yield* Effect.either(failingService.ensureSchema())

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(QueueOperationError)
        }
      })
    )
  })

  describe('enqueue', () => {
    it.effect('should insert message when under limit', () =>
      Effect.gen(function* () {
        const envelope = createTestEnvelope('test-id-1')

        yield* service.enqueue(envelope, 10)

        expect(mockSql.getData().size).toBe(1)
        expect(mockSql.getData().has('test-id-1')).toBe(true)
      })
    )

    it.effect('should fail when queue is full', () =>
      Effect.gen(function* () {
        for (let i = 0; i < 5; i++) {
          yield* service.enqueue(createTestEnvelope(), 10)
        }

        const result = yield* Effect.either(service.enqueue(createTestEnvelope(), 5))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(QueueFullError)
          expect((result.left as QueueFullError).limit).toBe(5)
          expect((result.left as QueueFullError).currentCount).toBe(5)
          expect((result.left as QueueFullError).retryAfter).toBe(60)
        }
      })
    )

    it.effect('should allow enqueue when at limit minus one', () =>
      Effect.gen(function* () {
        for (let i = 0; i < 4; i++) {
          yield* service.enqueue(createTestEnvelope(), 5)
        }

        yield* service.enqueue(createTestEnvelope(), 5)

        expect(mockSql.getData().size).toBe(5)
      })
    )
  })

  describe('dequeue', () => {
    it.effect('should remove message by id', () =>
      Effect.gen(function* () {
        const envelope = createTestEnvelope('test-id-1')
        yield* service.enqueue(envelope, 10)

        yield* service.dequeue('test-id-1')

        expect(mockSql.getData().size).toBe(0)
      })
    )

    it.effect('should handle non-existent id gracefully', () =>
      Effect.gen(function* () {
        yield* service.dequeue('non-existent')
      })
    )
  })

  describe('getAll', () => {
    it.effect('should return empty array when queue is empty', () =>
      Effect.gen(function* () {
        const result = yield* service.getAll()
        expect(result).toEqual([])
      })
    )

    it.effect('should return messages ordered by queued_at', () =>
      Effect.gen(function* () {
        const envelope1 = createTestEnvelope('id-1')
        const envelope2 = createTestEnvelope('id-2')
        const envelope3 = createTestEnvelope('id-3')

        yield* service.enqueue(envelope1, 10)
        yield* service.enqueue(envelope2, 10)
        yield* service.enqueue(envelope3, 10)

        const result = yield* service.getAll()

        expect(result.length).toBe(3)
        expect(result[0].id).toBe('id-1')
        expect(result[1].id).toBe('id-2')
        expect(result[2].id).toBe('id-3')
      })
    )

    it.effect('should return message with correct structure', () =>
      Effect.gen(function* () {
        const envelope = createTestEnvelope('test-id')
        yield* service.enqueue(envelope, 10)

        const result = yield* service.getAll()

        expect(result[0]).toHaveProperty('id')
        expect(result[0]).toHaveProperty('envelopeJson')
        expect(result[0]).toHaveProperty('queuedAt')
      })
    )
  })

  describe('count', () => {
    it.effect('should return 0 for empty queue', () =>
      Effect.gen(function* () {
        const count = yield* service.count()
        expect(count).toBe(0)
      })
    )

    it.effect('should return correct count', () =>
      Effect.gen(function* () {
        yield* service.enqueue(createTestEnvelope(), 10)
        yield* service.enqueue(createTestEnvelope(), 10)
        yield* service.enqueue(createTestEnvelope(), 10)

        const count = yield* service.count()
        expect(count).toBe(3)
      })
    )
  })

  describe('clear', () => {
    it.effect('should remove all messages', () =>
      Effect.gen(function* () {
        yield* service.enqueue(createTestEnvelope(), 10)
        yield* service.enqueue(createTestEnvelope(), 10)

        yield* service.clear()

        expect(mockSql.getData().size).toBe(0)
      })
    )

    it.effect('should handle empty queue', () =>
      Effect.gen(function* () {
        yield* service.clear()
      })
    )
  })

  describe('error handling', () => {
    it.effect('should wrap SQL errors in QueueOperationError', () =>
      Effect.gen(function* () {
        const failingSql = vi.fn(() => {
          throw new Error('Database connection lost')
        })
        const failingService = createMessageQueueService(failingSql)

        const result = yield* Effect.either(failingService.count())

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(QueueOperationError)
          expect((result.left as QueueOperationError).operation).toBe('count')
        }
      })
    )
  })
})
