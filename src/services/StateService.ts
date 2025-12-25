import { Effect } from 'effect'
import type { SessionStatus, HomeServerStatus, SessionState } from '../types'
import {
  assertValidStatusTransition,
  assertQueueDepthValid,
  assertTimestampsValid,
} from '../contracts'

export type StateUpdate =
  | { readonly type: 'SET_SESSION_ID'; readonly sessionId: string }
  | { readonly type: 'SET_STATUS'; readonly status: SessionStatus }
  | { readonly type: 'SET_HOME_SERVER'; readonly homeServer: HomeServerStatus }
  | { readonly type: 'SET_QUEUE_DEPTH'; readonly queueDepth: number }
  | { readonly type: 'TOUCH_ACTIVITY' }
  | { readonly type: 'INITIALIZE'; readonly sessionId: string }

export interface StateService {
  readonly getState: () => SessionState
  readonly update: (updates: StateUpdate | readonly StateUpdate[]) => Effect.Effect<SessionState>
  readonly isActive: () => boolean
  readonly isIdle: () => boolean
  readonly isClosed: () => boolean
}

const applyUpdate = (state: SessionState, update: StateUpdate): SessionState => {
  switch (update.type) {
    case 'SET_SESSION_ID':
      return { ...state, sessionId: update.sessionId }
    case 'SET_STATUS':
      assertValidStatusTransition(state.status, update.status)
      return { ...state, status: update.status }
    case 'SET_HOME_SERVER':
      return { ...state, homeServer: update.homeServer }
    case 'SET_QUEUE_DEPTH':
      assertQueueDepthValid(update.queueDepth)
      return { ...state, queueDepth: update.queueDepth }
    case 'TOUCH_ACTIVITY':
      return { ...state, lastActivityAt: Date.now() }
    case 'INITIALIZE':
      return {
        ...state,
        sessionId: update.sessionId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      }
  }
}

export const createStateService = (
  getState: () => SessionState,
  setState: (state: SessionState) => void
): StateService => ({
  getState,

  update: (updates) =>
    Effect.sync(() => {
      const currentState = getState()
      const updateList = Array.isArray(updates) ? updates : [updates]
      const newState = updateList.reduce(applyUpdate, currentState)
      assertTimestampsValid(newState)
      setState(newState)
      return newState
    }),

  isActive: () => getState().status === 'Active',
  isIdle: () => getState().status === 'Idle',
  isClosed: () => getState().status === 'Closed',
})

export const createInitialState = (): SessionState => ({
  sessionId: '',
  status: 'Active',
  homeServer: 'offline',
  queueDepth: 0,
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
})
