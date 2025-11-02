import type * as Effect from 'effect/Effect'
import type { Session } from '../aggregates/Session'
import type { SessionId } from '../value-objects/SessionId'
import type { RepositoryError } from './errors'

export interface SessionRepository {
  save(session: Session): Effect.Effect<void, RepositoryError>

  findById(id: SessionId): Effect.Effect<Session | null, RepositoryError>

  delete(id: SessionId): Effect.Effect<void, RepositoryError>

  exists(id: SessionId): Effect.Effect<boolean, RepositoryError>
}
