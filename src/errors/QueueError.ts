import { Data } from 'effect'

export class QueueFullError extends Data.TaggedError('QueueFullError')<{
  readonly limit: number
  readonly currentCount: number
  readonly retryAfter: number
}> {}

export class QueueOperationError extends Data.TaggedError('QueueOperationError')<{
  readonly operation: 'insert' | 'delete' | 'select' | 'count' | 'clear'
  readonly message: string
  readonly cause?: unknown
}> {}
