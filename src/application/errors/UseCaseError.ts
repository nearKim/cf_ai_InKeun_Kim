import { Data } from 'effect'
import type { RepositoryError } from '../../domain/repositories/errors'

export class UseCaseError extends Data.TaggedError('UseCaseError')<{
  readonly useCase: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class UseCaseExecutionError extends Data.TaggedError(
  'UseCaseExecutionError'
)<{
  readonly useCase: string
  readonly operation: string
  readonly message: string
  readonly cause?: RepositoryError | Error
}> {}

export class SessionNotFoundError extends Data.TaggedError(
  'SessionNotFoundError'
)<{
  readonly sessionId: string
  readonly message: string
}> {}

export class SessionNotActiveError extends Data.TaggedError(
  'SessionNotActiveError'
)<{
  readonly sessionId: string
  readonly currentState: string
  readonly message: string
}> {}

export class RequestNotFoundError extends Data.TaggedError(
  'RequestNotFoundError'
)<{
  readonly requestId: string
  readonly message: string
}> {}

export class InvalidRequestStateError extends Data.TaggedError(
  'InvalidRequestStateError'
)<{
  readonly requestId: string
  readonly currentState: string
  readonly expectedState: string
  readonly message: string
}> {}
