import { Effect } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { SessionId } from '../../domain/value-objects/SessionId'
import type { ClientMessage } from '../../domain/value-objects/ClientMessage'
import type { Session } from '../../domain/aggregates/Session'
import type { Request } from '../../domain/aggregates/Request'
import type { DomainEvent } from '../../domain/events/DomainEvent'
import * as RequestId from '../../domain/value-objects/RequestId'
import * as SessionAggregate from '../../domain/aggregates/Session'
import * as RequestAggregate from '../../domain/aggregates/Request'
import { UnitOfWorkService } from '../services/UnitOfWorkService'
import { withTransaction } from '../utils/transaction'
import {
  createSessionNotFoundError,
  createSessionNotActiveError,
} from '../errors/factories'
import { mapUseCaseError } from '../utils/errorMapping'
import type {
  SessionNotFoundError,
  SessionNotActiveError,
  UseCaseExecutionError,
} from '../errors/UseCaseError'

export class HandleClientMessageUseCase {
  execute(
    sessionId: SessionId,
    message: ClientMessage,
    timestamp?: number
  ): EffectType.Effect<
    {
      session: Session
      request: Request
      events: readonly DomainEvent[]
    },
    SessionNotFoundError | SessionNotActiveError | UseCaseExecutionError,
    UnitOfWorkService
  > {
    return withTransaction((uow) =>
      Effect.gen(function* () {
        const session = yield* uow.sessionRepository.findById(sessionId)

        if (session === null) {
          return yield* Effect.fail(createSessionNotFoundError(sessionId))
        }

        if (!SessionAggregate.isActive(session)) {
          return yield* Effect.fail(
            createSessionNotActiveError(sessionId, session.state)
          )
        }

        const requestId = yield* RequestId.generate()

        const { request, events: requestEvents } =
          yield* RequestAggregate.create({
            requestId,
            sessionId,
            message,
            timestamp,
          })

        const { session: updatedSession, events: sessionEvents } =
          yield* SessionAggregate.addRequest(session, request.requestId)

        yield* uow.sessionRepository.save(updatedSession)
        yield* uow.requestRepository.save(request)

        return {
          session: updatedSession,
          request,
          events: [...requestEvents, ...sessionEvents] as readonly DomainEvent[],
        }
      })
    ).pipe(
      mapUseCaseError('HandleClientMessageUseCase', [
        'SessionNotFoundError',
        'SessionNotActiveError',
      ])
    )
  }
}
