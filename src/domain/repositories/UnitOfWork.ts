import { Data } from 'effect'
import type * as Effect from 'effect/Effect'
import type { SessionRepository } from './SessionRepository'
import type { RequestRepository } from './RequestRepository'

export class TransactionError extends Data.TaggedError('TransactionError')<{
  readonly operation: 'begin' | 'commit' | 'rollback'
  readonly message: string
  readonly cause?: unknown
}> {}

export interface UnitOfWork {
  readonly sessionRepository: SessionRepository
  readonly requestRepository: RequestRepository
  readonly commit: () => Effect.Effect<void, TransactionError>
  readonly rollback: () => Effect.Effect<void, TransactionError>
}
