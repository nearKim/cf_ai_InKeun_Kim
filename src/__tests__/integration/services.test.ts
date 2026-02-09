import { it, describe } from '@effect/vitest'
import { Effect, Either, Exit } from 'effect'
import { expect, beforeEach } from 'vitest'
import {
  createStateService,
  createInitialState,
  createMessageQueueService,
  createAuthenticationService,
} from '../../services'
import { createTestToken } from '../../validation'
import type { SessionState } from '../../types'

describe('Services Integration', () => {
  describe('StateService with contracts', () => {
    let currentState: SessionState
    let service: ReturnType<typeof createStateService>

    beforeEach(() => {
      currentState = createInitialState()
      service = createStateService(
        () => currentState,
        (state) => {
          currentState = state
        }
      )
    })

    it.effect('should enforce valid state machine transitions', () =>
      Effect.gen(function* () {
        yield* service.update({ type: 'SET_STATUS', status: 'Idle' })
        expect(currentState.status).toBe('Idle')

        yield* service.update({ type: 'SET_STATUS', status: 'Active' })
        expect(currentState.status).toBe('Active')

        yield* service.update({ type: 'SET_STATUS', status: 'Closed' })
        expect(currentState.status).toBe('Closed')

        const exit = yield* Effect.exit(
          service.update({ type: 'SET_STATUS', status: 'Active' })
        )
        expect(Exit.isFailure(exit)).toBe(true)
      })
    )

    it.effect('should maintain invariants across multiple updates', () =>
      Effect.gen(function* () {
        const updates = [
          { type: 'INITIALIZE' as const, sessionId: 'test-session' },
          { type: 'SET_HOME_SERVER' as const, homeServer: 'online' as const },
          { type: 'SET_QUEUE_DEPTH' as const, queueDepth: 5 },
          { type: 'TOUCH_ACTIVITY' as const },
        ]

        yield* service.update(updates)

        expect(currentState.sessionId).toBe('test-session')
        expect(currentState.homeServer).toBe('online')
        expect(currentState.queueDepth).toBe(5)
        expect(currentState.createdAt).toBeGreaterThan(0)
        expect(currentState.lastActivityAt).toBeGreaterThanOrEqual(currentState.createdAt)
      })
    )

    it.effect('should rollback all changes on contract violation', () =>
      Effect.gen(function* () {
        const initialStatus = currentState.status
        const initialQueueDepth = currentState.queueDepth

        const updates = [
          { type: 'SET_STATUS' as const, status: 'Idle' as const },
          { type: 'SET_QUEUE_DEPTH' as const, queueDepth: -1 },
        ]

        const exit = yield* Effect.exit(service.update(updates))

        expect(Exit.isFailure(exit)).toBe(true)
        expect(currentState.status).toBe(initialStatus)
        expect(currentState.queueDepth).toBe(initialQueueDepth)
      })
    )
  })

  describe('MessageQueueService with EffectRunner', () => {
    const createMockSql = () => {
      const data = new Map()
      return <T>(strings: TemplateStringsArray, ...values: unknown[]): T[] => {
        const query = strings.join('?')
        if (query.includes('CREATE TABLE')) return [] as T[]
        if (query.includes('SELECT COUNT')) return [{ count: data.size }] as T[]
        if (query.includes('INSERT INTO')) {
          const [id, json, time] = values
          data.set(id, { id, envelope_json: json, queued_at: time })
          return [] as T[]
        }
        if (query.includes('DELETE') && query.includes('WHERE')) {
          data.delete(values[0])
          return [] as T[]
        }
        if (query.includes('DELETE FROM')) {
          data.clear()
          return [] as T[]
        }
        if (query.includes('SELECT id')) {
          return Array.from(data.values()).sort(
            (a: { queued_at: number }, b: { queued_at: number }) => a.queued_at - b.queued_at
          ) as T[]
        }
        return [] as T[]
      }
    }

    it.effect('should work with EffectRunner for async operations', () =>
      Effect.gen(function* () {
        const queueService = createMessageQueueService(createMockSql())

        yield* queueService.ensureSchema()
        yield* queueService.enqueue('id-1', '{"payload":"test1"}', 10)
        yield* queueService.enqueue('id-2', '{"payload":"test2"}', 10)

        const count = yield* queueService.count()
        expect(count).toBe(2)

        const messages = yield* queueService.getAll()
        expect(messages.length).toBe(2)
      })
    )

    it.effect('should handle queue limits correctly', () =>
      Effect.gen(function* () {
        const queueService = createMessageQueueService(createMockSql())

        yield* queueService.ensureSchema()

        for (let i = 0; i < 5; i++) {
          yield* queueService.enqueue(`id-${i}`, `{"payload":"msg${i}"}`, 5)
        }

        const result = yield* Effect.either(
          queueService.enqueue('overflow-id', '{"payload":"overflow"}', 5)
        )

        expect(Either.isLeft(result)).toBe(true)
      })
    )
  })

  describe('AuthenticationService with TokenValidator', () => {
    const secretKey = 'integration-test-secret'
    const allowedPattern = /^wss:\/\/.*\.example\.com$/

    it.effect('should validate and authorize session access', () =>
      Effect.gen(function* () {
        const authService = createAuthenticationService(secretKey, allowedPattern)
        const validToken = yield* Effect.promise(() =>
          createTestToken(
            {
              userId: 'user-123',
              sessionId: 'session-456',
              homeServerUrl: 'wss://api.example.com',
            },
            secretKey
          )
        )

        const payload = yield* authService.validateSessionAccess(validToken, 'session-456')

        expect(payload.userId).toBe('user-123')
        expect(payload.sessionId).toBe('session-456')
      })
    )

    it.effect('should reject access to different session', () =>
      Effect.gen(function* () {
        const authService = createAuthenticationService(secretKey, allowedPattern)
        const validToken = yield* Effect.promise(() =>
          createTestToken(
            {
              userId: 'user-123',
              sessionId: 'session-456',
              homeServerUrl: 'wss://api.example.com',
            },
            secretKey
          )
        )

        const result = yield* Effect.either(
          authService.validateSessionAccess(validToken, 'different-session')
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left.reason).toBe('session_mismatch')
        }
      })
    )
  })

  describe('Full service workflow', () => {
    const createMockSql = () => {
      const data = new Map()
      return <T>(strings: TemplateStringsArray, ...values: unknown[]): T[] => {
        const query = strings.join('?')
        if (query.includes('CREATE TABLE')) return [] as T[]
        if (query.includes('SELECT COUNT')) return [{ count: data.size }] as T[]
        if (query.includes('INSERT INTO')) {
          const [id, json, time] = values
          data.set(id, { id, envelope_json: json, queued_at: time })
          return [] as T[]
        }
        if (query.includes('DELETE') && query.includes('WHERE')) {
          data.delete(values[0])
          return [] as T[]
        }
        if (query.includes('DELETE FROM')) {
          data.clear()
          return [] as T[]
        }
        if (query.includes('SELECT id')) {
          return Array.from(data.values()).sort(
            (a: { queued_at: number }, b: { queued_at: number }) => a.queued_at - b.queued_at
          ) as T[]
        }
        return [] as T[]
      }
    }

    it.effect('should handle session lifecycle with all services', () =>
      Effect.gen(function* () {
        const secretKey = 'workflow-secret'

        let currentState = createInitialState()
        const stateService = createStateService(
          () => currentState,
          (state) => {
            currentState = state
          }
        )

        const queueService = createMessageQueueService(createMockSql())
        const authService = createAuthenticationService(
          secretKey,
          /^wss:\/\/.*\.example\.com$/
        )

        yield* queueService.ensureSchema()

        const token = yield* Effect.promise(() =>
          createTestToken(
            {
              userId: 'user-1',
              sessionId: 'session-1',
              homeServerUrl: 'wss://api.example.com',
            },
            secretKey
          )
        )

        const payload = yield* authService.validateSessionAccess(token, 'session-1')
        expect(payload.userId).toBe('user-1')

        yield* stateService.update({ type: 'INITIALIZE', sessionId: payload.sessionId })
        expect(currentState.sessionId).toBe('session-1')

        yield* stateService.update({ type: 'SET_HOME_SERVER', homeServer: 'online' })
        expect(currentState.homeServer).toBe('online')

        yield* queueService.enqueue('msg-1', '{"payload":"user message"}', 100)

        const count = yield* queueService.count()
        yield* stateService.update({ type: 'SET_QUEUE_DEPTH', queueDepth: count })
        expect(currentState.queueDepth).toBe(1)

        yield* stateService.update({ type: 'SET_STATUS', status: 'Idle' })
        expect(stateService.isIdle()).toBe(true)

        yield* stateService.update({ type: 'SET_STATUS', status: 'Closed' })
        expect(stateService.isClosed()).toBe(true)

        yield* queueService.clear()
        const finalCount = yield* queueService.count()
        expect(finalCount).toBe(0)
      })
    )
  })
})
