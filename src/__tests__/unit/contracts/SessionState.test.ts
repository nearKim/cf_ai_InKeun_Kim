import { describe, it, expect } from 'vitest'
import {
  assertValidStatusTransition,
  assertSessionInitialized,
  assertQueueDepthValid,
  assertSessionNotClosed,
  assertSessionActive,
  assertTimestampsValid,
} from '../../../contracts'
import type { SessionState } from '../../../types'

const createState = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: 'test-session-123',
  status: 'Active',
  homeServer: 'online',
  queueDepth: 0,
  createdAt: 1000,
  lastActivityAt: 2000,
  ...overrides,
})

describe('SessionState contracts', () => {
  describe('assertValidStatusTransition', () => {
    describe('from Active', () => {
      it('should allow Active -> Idle', () => {
        expect(() => assertValidStatusTransition('Active', 'Idle')).not.toThrow()
      })

      it('should allow Active -> Closed', () => {
        expect(() => assertValidStatusTransition('Active', 'Closed')).not.toThrow()
      })

      it('should reject Active -> Active (no-op transition)', () => {
        expect(() => assertValidStatusTransition('Active', 'Active')).toThrow(
          'Invariant violated: Invalid status transition: Active → Active'
        )
      })
    })

    describe('from Idle', () => {
      it('should allow Idle -> Active', () => {
        expect(() => assertValidStatusTransition('Idle', 'Active')).not.toThrow()
      })

      it('should allow Idle -> Closed', () => {
        expect(() => assertValidStatusTransition('Idle', 'Closed')).not.toThrow()
      })

      it('should reject Idle -> Idle (no-op transition)', () => {
        expect(() => assertValidStatusTransition('Idle', 'Idle')).toThrow(
          'Invariant violated: Invalid status transition: Idle → Idle'
        )
      })
    })

    describe('from Closed', () => {
      it('should reject Closed -> Active (terminal state)', () => {
        expect(() => assertValidStatusTransition('Closed', 'Active')).toThrow(
          'Invariant violated: Invalid status transition: Closed → Active'
        )
      })

      it('should reject Closed -> Idle (terminal state)', () => {
        expect(() => assertValidStatusTransition('Closed', 'Idle')).toThrow(
          'Invariant violated: Invalid status transition: Closed → Idle'
        )
      })

      it('should reject Closed -> Closed (terminal state)', () => {
        expect(() => assertValidStatusTransition('Closed', 'Closed')).toThrow(
          'Invariant violated: Invalid status transition: Closed → Closed'
        )
      })
    })
  })

  describe('assertSessionInitialized', () => {
    it('should pass when sessionId is set', () => {
      const state = createState({ sessionId: 'valid-id' })
      expect(() => assertSessionInitialized(state)).not.toThrow()
    })

    it('should throw when sessionId is empty', () => {
      const state = createState({ sessionId: '' })
      expect(() => assertSessionInitialized(state)).toThrow(
        'Precondition violated: Session must be initialized before this operation'
      )
    })
  })

  describe('assertQueueDepthValid', () => {
    it('should pass when depth is zero', () => {
      expect(() => assertQueueDepthValid(0)).not.toThrow()
    })

    it('should pass when depth is positive', () => {
      expect(() => assertQueueDepthValid(100)).not.toThrow()
    })

    it('should throw when depth is negative', () => {
      expect(() => assertQueueDepthValid(-1)).toThrow(
        'Invariant violated: Queue depth cannot be negative: -1'
      )
    })

    it('should throw when depth is very negative', () => {
      expect(() => assertQueueDepthValid(-999)).toThrow(
        'Invariant violated: Queue depth cannot be negative: -999'
      )
    })
  })

  describe('assertSessionNotClosed', () => {
    it('should pass when status is Active', () => {
      const state = createState({ status: 'Active' })
      expect(() => assertSessionNotClosed(state)).not.toThrow()
    })

    it('should pass when status is Idle', () => {
      const state = createState({ status: 'Idle' })
      expect(() => assertSessionNotClosed(state)).not.toThrow()
    })

    it('should throw when status is Closed', () => {
      const state = createState({ status: 'Closed' })
      expect(() => assertSessionNotClosed(state)).toThrow(
        'Precondition violated: Operation not allowed on closed session'
      )
    })
  })

  describe('assertSessionActive', () => {
    it('should pass when status is Active', () => {
      const state = createState({ status: 'Active' })
      expect(() => assertSessionActive(state)).not.toThrow()
    })

    it('should throw when status is Idle', () => {
      const state = createState({ status: 'Idle' })
      expect(() => assertSessionActive(state)).toThrow(
        'Precondition violated: Session must be Active, but is Idle'
      )
    })

    it('should throw when status is Closed', () => {
      const state = createState({ status: 'Closed' })
      expect(() => assertSessionActive(state)).toThrow(
        'Precondition violated: Session must be Active, but is Closed'
      )
    })
  })

  describe('assertTimestampsValid', () => {
    it('should pass when timestamps are valid', () => {
      const state = createState({ createdAt: 1000, lastActivityAt: 2000 })
      expect(() => assertTimestampsValid(state)).not.toThrow()
    })

    it('should pass when createdAt equals lastActivityAt', () => {
      const state = createState({ createdAt: 1000, lastActivityAt: 1000 })
      expect(() => assertTimestampsValid(state)).not.toThrow()
    })

    it('should throw when createdAt is zero', () => {
      const state = createState({ createdAt: 0 })
      expect(() => assertTimestampsValid(state)).toThrow(
        'Invariant violated: createdAt must be positive: 0'
      )
    })

    it('should throw when createdAt is negative', () => {
      const state = createState({ createdAt: -100 })
      expect(() => assertTimestampsValid(state)).toThrow(
        'Invariant violated: createdAt must be positive: -100'
      )
    })

    it('should throw when lastActivityAt is zero', () => {
      const state = createState({ lastActivityAt: 0 })
      expect(() => assertTimestampsValid(state)).toThrow(
        'Invariant violated: lastActivityAt must be positive: 0'
      )
    })

    it('should throw when lastActivityAt is before createdAt', () => {
      const state = createState({ createdAt: 2000, lastActivityAt: 1000 })
      expect(() => assertTimestampsValid(state)).toThrow(
        'Invariant violated: lastActivityAt (1000) cannot be before createdAt (2000)'
      )
    })
  })
})
