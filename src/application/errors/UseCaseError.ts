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

export class QueueFullError extends Data.TaggedError('QueueFullError')<{
  readonly sessionId: string
  readonly queueLimit: number
  readonly message: string
}> {}

export class SessionExpiredError extends Data.TaggedError(
  'SessionExpiredError'
)<{
  readonly sessionId: string
  readonly message: string
}> {}

export class InvalidMessageError extends Data.TaggedError(
  'InvalidMessageError'
)<{
  readonly reason: string
  readonly message: string
}> {}

export class HomeServerUnavailableError extends Data.TaggedError(
  'HomeServerUnavailableError'
)<{
  readonly sessionId: string
  readonly message: string
}> {}
