import type { SessionId } from '../../domain/value-objects/SessionId'
import type { RequestId } from '../../domain/value-objects/RequestId'
import * as SessionIdModule from '../../domain/value-objects/SessionId'
import * as RequestIdModule from '../../domain/value-objects/RequestId'
import {
  SessionNotFoundError,
  SessionNotActiveError,
  RequestNotFoundError,
  InvalidRequestStateError,
} from './UseCaseError'

export const createSessionNotFoundError = (sessionId: SessionId) =>
  new SessionNotFoundError({
    sessionId: SessionIdModule.unwrap(sessionId),
    message: `Session with ID ${SessionIdModule.unwrap(sessionId)} not found`,
  })

export const createSessionNotActiveError = (
  sessionId: SessionId,
  currentState: string
) =>
  new SessionNotActiveError({
    sessionId: SessionIdModule.unwrap(sessionId),
    currentState,
    message: `Session is ${currentState}, cannot handle messages`,
  })

export const createRequestNotFoundError = (requestId: RequestId) =>
  new RequestNotFoundError({
    requestId: RequestIdModule.unwrap(requestId),
    message: `Request with ID ${RequestIdModule.unwrap(requestId)} not found`,
  })

export const createInvalidRequestStateError = (
  requestId: RequestId,
  currentState: string,
  expectedState: string
) =>
  new InvalidRequestStateError({
    requestId: RequestIdModule.unwrap(requestId),
    currentState,
    expectedState,
    message: `Request is ${currentState}, expected ${expectedState}`,
  })
