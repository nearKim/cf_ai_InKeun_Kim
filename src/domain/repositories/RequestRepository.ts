import type * as Effect from 'effect/Effect'
import type { Request } from '../aggregates/Request'
import type { RequestId } from '../value-objects/RequestId'
import type { SessionId } from '../value-objects/SessionId'
import type { RepositoryError } from './errors'

export interface RequestRepository {
  save(request: Request): Effect.Effect<void, RepositoryError>

  findById(id: RequestId): Effect.Effect<Request | null, RepositoryError>

  findBySessionId(
    sessionId: SessionId
  ): Effect.Effect<readonly Request[], RepositoryError>

  delete(id: RequestId): Effect.Effect<void, RepositoryError>

  exists(id: RequestId): Effect.Effect<boolean, RepositoryError>

  countBySessionId(sessionId: SessionId): Effect.Effect<number, RepositoryError>
}
