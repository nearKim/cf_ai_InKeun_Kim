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
