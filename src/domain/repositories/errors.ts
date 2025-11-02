import { Data } from 'effect'

export class RepositoryError extends Data.TaggedError('RepositoryError')<{
  readonly operation: string
  readonly cause?: unknown
  readonly message: string
}> {}

export class EntityNotFoundError extends Data.TaggedError(
  'EntityNotFoundError'
)<{
  readonly entityType: string
  readonly entityId: string
  readonly message: string
}> {}

export class StorageError extends Data.TaggedError('StorageError')<{
  readonly operation: string
  readonly cause?: unknown
  readonly message: string
}> {}

export class SerializationError extends Data.TaggedError('SerializationError')<{
  readonly direction: 'serialize' | 'deserialize'
  readonly cause?: unknown
  readonly message: string
}> {}
