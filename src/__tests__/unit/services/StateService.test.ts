import { it, describe } from '@effect/vitest'
import { Effect, Either, Exit } from 'effect'
import { expect, vi, beforeEach } from 'vitest'
import { createStateService, createInitialState, type StateUpdate } from '../../../services'
import type { SessionState } from '../../../types'

describe('StateService', () => {
  let currentState: SessionState
  let setState: ReturnType<typeof vi.fn>

  beforeEach(() => {
    currentState = createInitialState()
    setState = vi.fn((newState: SessionState) => {
      currentState = newState
    })
  })

  const createService = () => createStateService(() => currentState, setState)

  describe('createInitialState', () => {
    it('should create state with empty sessionId', () => {
      const state = createInitialState()
      expect(state.sessionId).toBe('')
    })

    it('should create state with Active status', () => {
      const state = createInitialState()
      expect(state.status).toBe('Active')
    })

    it('should create state with offline homeServer', () => {
      const state = createInitialState()
      expect(state.homeServer).toBe('offline')
    })

    it('should create state with zero queueDepth', () => {
      const state = createInitialState()
      expect(state.queueDepth).toBe(0)
    })

    it('should create state with valid timestamps', () => {
      const before = Date.now()
      const state = createInitialState()
      const after = Date.now()

      expect(state.createdAt).toBeGreaterThanOrEqual(before)
      expect(state.createdAt).toBeLessThanOrEqual(after)
      expect(state.lastActivityAt).toBeGreaterThanOrEqual(before)
      expect(state.lastActivityAt).toBeLessThanOrEqual(after)
    })
  })

  describe('getState', () => {
    it('should return current state', () => {
      const service = createService()
      expect(service.getState()).toBe(currentState)
    })
  })

  describe('update', () => {
    describe('SET_SESSION_ID', () => {
      it.effect('should update sessionId', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_SESSION_ID', sessionId: 'new-session' }

          yield* service.update(update)

          expect(setState).toHaveBeenCalled()
          expect(currentState.sessionId).toBe('new-session')
        })
      )
    })

    describe('SET_STATUS', () => {
      it.effect('should update status with valid transition', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_STATUS', status: 'Idle' }

          yield* service.update(update)

          expect(currentState.status).toBe('Idle')
        })
      )

      it.effect('should throw on invalid transition', () =>
        Effect.gen(function* () {
          currentState = { ...currentState, status: 'Closed' }
          const service = createService()
          const update: StateUpdate = { type: 'SET_STATUS', status: 'Active' }

          const exit = yield* Effect.exit(service.update(update))

          expect(Exit.isFailure(exit)).toBe(true)
        })
      )
    })

    describe('SET_HOME_SERVER', () => {
      it.effect('should update homeServer to online', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_HOME_SERVER', homeServer: 'online' }

          yield* service.update(update)

          expect(currentState.homeServer).toBe('online')
        })
      )

      it.effect('should update homeServer to connecting', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_HOME_SERVER', homeServer: 'connecting' }

          yield* service.update(update)

          expect(currentState.homeServer).toBe('connecting')
        })
      )
    })

    describe('SET_QUEUE_DEPTH', () => {
      it.effect('should update queueDepth', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_QUEUE_DEPTH', queueDepth: 42 }

          yield* service.update(update)

          expect(currentState.queueDepth).toBe(42)
        })
      )

      it.effect('should throw on negative queueDepth', () =>
        Effect.gen(function* () {
          const service = createService()
          const update: StateUpdate = { type: 'SET_QUEUE_DEPTH', queueDepth: -1 }

          const exit = yield* Effect.exit(service.update(update))

          expect(Exit.isFailure(exit)).toBe(true)
        })
      )
    })

    describe('TOUCH_ACTIVITY', () => {
      it.effect('should update lastActivityAt', () =>
        Effect.gen(function* () {
          const service = createService()
          const before = Date.now()
          const update: StateUpdate = { type: 'TOUCH_ACTIVITY' }

          yield* service.update(update)

          expect(currentState.lastActivityAt).toBeGreaterThanOrEqual(before)
        })
      )
    })

    describe('INITIALIZE', () => {
      it.effect('should set sessionId and timestamps', () =>
        Effect.gen(function* () {
          const service = createService()
          const before = Date.now()
          const update: StateUpdate = { type: 'INITIALIZE', sessionId: 'new-session' }

          yield* service.update(update)

          expect(currentState.sessionId).toBe('new-session')
          expect(currentState.createdAt).toBeGreaterThanOrEqual(before)
          expect(currentState.lastActivityAt).toBeGreaterThanOrEqual(before)
        })
      )
    })

    describe('multiple updates', () => {
      it.effect('should apply updates in order', () =>
        Effect.gen(function* () {
          const service = createService()
          const updates: readonly StateUpdate[] = [
            { type: 'SET_SESSION_ID', sessionId: 'test-session' },
            { type: 'SET_HOME_SERVER', homeServer: 'online' },
            { type: 'SET_QUEUE_DEPTH', queueDepth: 5 },
          ]

          yield* service.update(updates)

          expect(currentState.sessionId).toBe('test-session')
          expect(currentState.homeServer).toBe('online')
          expect(currentState.queueDepth).toBe(5)
          expect(setState).toHaveBeenCalledTimes(1)
        })
      )

      it.effect('should stop on first invalid update', () =>
        Effect.gen(function* () {
          const service = createService()
          const updates: readonly StateUpdate[] = [
            { type: 'SET_SESSION_ID', sessionId: 'test-session' },
            { type: 'SET_QUEUE_DEPTH', queueDepth: -1 },
            { type: 'SET_HOME_SERVER', homeServer: 'online' },
          ]

          const exit = yield* Effect.exit(service.update(updates))

          expect(Exit.isFailure(exit)).toBe(true)
          expect(setState).not.toHaveBeenCalled()
        })
      )
    })
  })

  describe('status helpers', () => {
    describe('isActive', () => {
      it('should return true when Active', () => {
        currentState = { ...currentState, status: 'Active' }
        const service = createService()
        expect(service.isActive()).toBe(true)
      })

      it('should return false when Idle', () => {
        currentState = { ...currentState, status: 'Idle' }
        const service = createService()
        expect(service.isActive()).toBe(false)
      })

      it('should return false when Closed', () => {
        currentState = { ...currentState, status: 'Closed' }
        const service = createService()
        expect(service.isActive()).toBe(false)
      })
    })

    describe('isIdle', () => {
      it('should return true when Idle', () => {
        currentState = { ...currentState, status: 'Idle' }
        const service = createService()
        expect(service.isIdle()).toBe(true)
      })

      it('should return false when Active', () => {
        currentState = { ...currentState, status: 'Active' }
        const service = createService()
        expect(service.isIdle()).toBe(false)
      })
    })

    describe('isClosed', () => {
      it('should return true when Closed', () => {
        currentState = { ...currentState, status: 'Closed' }
        const service = createService()
        expect(service.isClosed()).toBe(true)
      })

      it('should return false when Active', () => {
        currentState = { ...currentState, status: 'Active' }
        const service = createService()
        expect(service.isClosed()).toBe(false)
      })
    })
  })
})
