import {Effect, pipe} from 'effect'
import type * as EffectType from 'effect/Effect'
import type {SessionId} from '../../domain/value-objects/SessionId'
import type {Session} from '../../domain/aggregates/Session'
import type {DomainEvent} from '../../domain/events/DomainEvent'
import type {SessionRepository} from '../../domain/repositories/SessionRepository'
import * as SessionAggregate from '../../domain/aggregates/Session'
import {UseCaseExecutionError} from '../errors/UseCaseError'

export class EstablishSessionUseCase {
  constructor(private readonly sessionRepository: SessionRepository) {
  }

  execute(
    sessionId: SessionId,
    timestamp?: number
  ): EffectType.Effect<
    { session: Session; events: readonly DomainEvent[] },
    UseCaseExecutionError
  > {
    return SessionAggregate.establish({sessionId, timestamp}).pipe(
      Effect.andThen(({session, events}) =>
        this.sessionRepository.save(session).pipe(Effect.as({session, events}))
      ),
      Effect.mapError(
        (error) =>
          new UseCaseExecutionError({
            useCase: 'EstablishSessionUseCase',
            operation: 'execute',
            message: `Failed to establish session: ${error}`,
            cause: error,
          })
      )
    )
  }
}
