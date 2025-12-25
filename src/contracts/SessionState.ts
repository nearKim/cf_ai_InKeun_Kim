import { invariant, precondition } from './assertions'
import type { SessionStatus, SessionState } from '../types'

const VALID_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  Active: ['Idle', 'Closed'],
  Idle: ['Active', 'Closed'],
  Closed: [],
} as const

export function assertValidStatusTransition(from: SessionStatus, to: SessionStatus): void {
  invariant(
    VALID_TRANSITIONS[from].includes(to),
    `Invalid status transition: ${from} → ${to}. Valid: [${VALID_TRANSITIONS[from].join(', ')}]`
  )
}

export function assertSessionInitialized(state: SessionState): void {
  precondition(state.sessionId !== '', 'Session must be initialized before this operation')
}

export function assertQueueDepthValid(depth: number): void {
  invariant(depth >= 0, `Queue depth cannot be negative: ${depth}`)
}

export function assertSessionNotClosed(state: SessionState): void {
  precondition(state.status !== 'Closed', 'Operation not allowed on closed session')
}

export function assertSessionActive(state: SessionState): void {
  precondition(state.status === 'Active', `Session must be Active, but is ${state.status}`)
}

export function assertTimestampsValid(state: SessionState): void {
  invariant(state.createdAt > 0, `createdAt must be positive: ${state.createdAt}`)
  invariant(state.lastActivityAt > 0, `lastActivityAt must be positive: ${state.lastActivityAt}`)
  invariant(
    state.lastActivityAt >= state.createdAt,
    `lastActivityAt (${state.lastActivityAt}) cannot be before createdAt (${state.createdAt})`
  )
}
