import { Data, Effect } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { RequestId } from '../value-objects/RequestId'
import type { SessionId } from '../value-objects/SessionId'
import type { ClientMessage } from '../value-objects/ClientMessage'
import type { StreamChunk } from '../value-objects/StreamChunk'
import type { DomainEvent } from '../events/DomainEvent'
import * as Constructors from '../events/constructors'

export type RequestState = 'Pending' | 'Streaming' | 'Completed' | 'Failed'

export type Request = {
  readonly requestId: RequestId
  readonly sessionId: SessionId
  readonly message: ClientMessage
  readonly state: RequestState
  readonly chunks: readonly StreamChunk[]
  readonly receivedAt: number
  readonly completedAt?: number
  readonly failureReason?: string
}

export type RequestWithEvents = {
  readonly request: Request
  readonly events: readonly DomainEvent[]
}

export class InvalidRequestStateError extends Data.TaggedError(
  'InvalidRequestStateError'
)<{
  readonly currentState: RequestState
  readonly operation: string
  readonly message: string
}> {}

export const create = (params: {
  requestId: RequestId
  sessionId: SessionId
  message: ClientMessage
  timestamp?: number
}): EffectType.Effect<RequestWithEvents, never> => {
  const now = params.timestamp ?? Date.now()

  const request: Request = Data.struct({
    requestId: params.requestId,
    sessionId: params.sessionId,
    message: params.message,
    state: 'Pending' as const,
    chunks: [],
    receivedAt: now,
    completedAt: undefined,
    failureReason: undefined,
  })

  const event = Constructors.makeRequestReceived({
    requestId: params.requestId,
    sessionId: params.sessionId,
    message: params.message,
    timestamp: now,
  })

  return Effect.succeed({
    request,
    events: [event],
  })
}

export const addChunk = (
  request: Request,
  chunk: StreamChunk
): EffectType.Effect<RequestWithEvents, InvalidRequestStateError> => {
  if (!canAcceptChunks(request)) {
    return Effect.fail(
      new InvalidRequestStateError({
        currentState: request.state,
        operation: 'addChunk',
        message: `Cannot add chunk to request in ${request.state} state`,
      })
    )
  }

  const newState: RequestState =
    request.state === 'Pending' ? 'Streaming' : request.state

  const updatedRequest: Request = Data.struct({
    ...request,
    state: newState,
    chunks: [...request.chunks, chunk],
  })

  const event = Constructors.makeResponseChunkReceived({
    requestId: request.requestId,
    chunk,
  })

  return Effect.succeed({
    request: updatedRequest,
    events: [event],
  })
}

export const complete = (
  request: Request
): EffectType.Effect<RequestWithEvents, InvalidRequestStateError> => {
  if (request.state !== 'Streaming') {
    return Effect.fail(
      new InvalidRequestStateError({
        currentState: request.state,
        operation: 'complete',
        message: `Cannot complete request in ${request.state} state. Must be Streaming.`,
      })
    )
  }

  const now = Date.now()

  const updatedRequest: Request = Data.struct({
    ...request,
    state: 'Completed' as const,
    completedAt: now,
  })

  const event = Constructors.makeRequestCompleted({
    requestId: request.requestId,
    timestamp: now,
  })

  return Effect.succeed({
    request: updatedRequest,
    events: [event],
  })
}

export const fail = (
  request: Request,
  error: string
): EffectType.Effect<RequestWithEvents, InvalidRequestStateError> => {
  if (request.state === 'Completed' || request.state === 'Failed') {
    return Effect.fail(
      new InvalidRequestStateError({
        currentState: request.state,
        operation: 'fail',
        message: `Cannot fail request in ${request.state} state. Request is already terminal.`,
      })
    )
  }

  const now = Date.now()

  const updatedRequest: Request = Data.struct({
    ...request,
    state: 'Failed' as const,
    completedAt: now,
    failureReason: error,
  })

  const event = Constructors.makeRequestFailed({
    requestId: request.requestId,
    error,
    timestamp: now,
  })

  return Effect.succeed({
    request: updatedRequest,
    events: [event],
  })
}

export const isCompleted = (request: Request): boolean => {
  return request.state === 'Completed'
}

export const isFailed = (request: Request): boolean => {
  return request.state === 'Failed'
}

export const canAcceptChunks = (request: Request): boolean => {
  return request.state === 'Pending' || request.state === 'Streaming'
}

export const getChunks = (request: Request): readonly StreamChunk[] => {
  return request.chunks
}

export const getFullResponse = (request: Request): string => {
  return request.chunks
    .filter((chunk) => chunk._tag === 'Delta')
    .map((chunk) => (chunk._tag === 'Delta' ? chunk.content : ''))
    .join('')
}
