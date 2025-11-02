import { Effect, Match, Exit } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { SessionId } from '../../domain/value-objects/SessionId'
import type { ClientMessage } from '../../domain/value-objects/ClientMessage'
import type { Session } from '../../domain/aggregates/Session'
import type { Request } from '../../domain/aggregates/Request'
import type { DomainEvent } from '../../domain/events/DomainEvent'
import * as SessionIdModule from '../../domain/value-objects/SessionId'
import * as RequestId from '../../domain/value-objects/RequestId'
import * as SessionAggregate from '../../domain/aggregates/Session'
import * as RequestAggregate from '../../domain/aggregates/Request'
import {
  UseCaseExecutionError,
  SessionNotFoundError,
  SessionNotActiveError,
} from '../errors/UseCaseError'
import { UnitOfWorkService } from '../services/UnitOfWorkService'

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
    return Effect.acquireUseRelease(
      Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        return yield* service.begin()
      }),

      (uow) =>
        Effect.gen(function* () {
          const session = yield* uow.sessionRepository.findById(sessionId)

          if (session === null) {
            return yield* Effect.fail(
              new SessionNotFoundError({
                sessionId: SessionIdModule.unwrap(sessionId),
                message: `Session with ID ${SessionIdModule.unwrap(sessionId)} not found`,
              })
            )
          }

          if (!SessionAggregate.isActive(session)) {
            return yield* Effect.fail(
              new SessionNotActiveError({
                sessionId: SessionIdModule.unwrap(sessionId),
                currentState: session.state,
                message: `Session is ${session.state}, cannot handle messages`,
              })
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
            events: [...requestEvents, ...sessionEvents],
          }
        }),

      (uow, exit) =>
        Exit.isSuccess(exit)
          ? uow.commit().pipe(
              Effect.tap(() => Effect.logDebug('Transaction committed')),
              Effect.catchAll((err) =>
                Effect.logWarning(`Commit failed: ${err}`).pipe(
                  Effect.andThen(Effect.void)
                )
              )
            )
          : uow.rollback().pipe(
              Effect.tap(() => Effect.logDebug('Transaction rolled back')),
              Effect.catchAll((err) =>
                Effect.logWarning(`Rollback failed: ${err}`).pipe(
                  Effect.andThen(Effect.void)
                )
              )
            )
    ).pipe(
      Effect.mapError((error) =>
        Match.value(error).pipe(
          Match.tag('SessionNotFoundError', (err) => err),
          Match.tag('SessionNotActiveError', (err) => err),
          Match.orElse((err) =>
            new UseCaseExecutionError({
              useCase: 'HandleClientMessageUseCase',
              operation: 'execute',
              message: `Failed to handle client message: ${err}`,
              cause: err as Error,
            })
          )
        )
      )
    )
  }
}
