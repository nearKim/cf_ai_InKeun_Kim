import { Data, Effect, Equal } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { SessionId } from '../value-objects/SessionId'
import type { RequestId } from '../value-objects/RequestId'
import type { DomainEvent } from '../events/DomainEvent'
import * as Constructors from '../events/constructors'

export type SessionState = 'Active' | 'Closed'

export type Session = {
  readonly sessionId: SessionId
  readonly state: SessionState
  readonly requestIds: readonly RequestId[]
  readonly establishedAt: number
  readonly closedAt?: number
  readonly closeReason?: string
}

export type SessionWithEvents = {
  readonly session: Session
  readonly events: readonly DomainEvent[]
}

export class InvalidSessionStateError extends Data.TaggedError(
  'InvalidSessionStateError'
)<{
  readonly currentState: SessionState
  readonly operation: string
  readonly message: string
}> {}

export const establish = (params: {
  sessionId: SessionId
  timestamp?: number
}): EffectType.Effect<SessionWithEvents, never> => {
  const now = params.timestamp ?? Date.now()

  const session: Session = Data.struct({
    sessionId: params.sessionId,
    state: 'Active' as const,
    requestIds: [],
    establishedAt: now,
    closedAt: undefined,
    closeReason: undefined,
  })

  const event = Constructors.makeSessionEstablished({
    sessionId: params.sessionId,
    timestamp: now,
  })

  return Effect.succeed({
    session,
    events: [event],
  })
}

export const addRequest = (
  session: Session,
  requestId: RequestId
): EffectType.Effect<SessionWithEvents, InvalidSessionStateError> => {
  if (session.state !== 'Active') {
    return Effect.fail(
      new InvalidSessionStateError({
        currentState: session.state,
        operation: 'addRequest',
        message: `Cannot add request to session in ${session.state} state. Session must be Active.`,
      })
    )
  }

  const updatedSession: Session = Data.struct({
    ...session,
    requestIds: [...session.requestIds, requestId],
  })

  return Effect.succeed({
    session: updatedSession,
    events: [],
  })
}

export const close = (
  session: Session,
  reason?: string,
  timestamp?: number
): EffectType.Effect<SessionWithEvents, InvalidSessionStateError> => {
  if (session.state !== 'Active') {
    return Effect.fail(
      new InvalidSessionStateError({
        currentState: session.state,
        operation: 'close',
        message: `Cannot close session in ${session.state} state. Session is already closed.`,
      })
    )
  }

  const now = timestamp ?? Date.now()

  const updatedSession: Session = Data.struct({
    ...session,
    state: 'Closed' as const,
    closedAt: now,
    closeReason: reason,
  })

  const event = Constructors.makeSessionClosed({
    sessionId: session.sessionId,
    reason,
    timestamp: now,
  })

  return Effect.succeed({
    session: updatedSession,
    events: [event],
  })
}

export const isActive = (session: Session): boolean => {
  return session.state === 'Active'
}

export const isClosed = (session: Session): boolean => {
  return session.state === 'Closed'
}

export const getRequestIds = (session: Session): readonly RequestId[] => {
  return session.requestIds
}

export const getRequestCount = (session: Session): number => {
  return session.requestIds.length
}

export const hasRequest = (session: Session, requestId: RequestId): boolean => {
  return session.requestIds.some((id) => Equal.equals(id, requestId))
}

export const getDuration = (session: Session): number | undefined => {
  if (session.closedAt === undefined) {
    return undefined
  }
  return session.closedAt - session.establishedAt
}
