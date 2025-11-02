import { Effect, Match, Exit } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { RequestId } from '../../domain/value-objects/RequestId'
import type { StreamChunk } from '../../domain/value-objects/StreamChunk'
import type { Request } from '../../domain/aggregates/Request'
import * as RequestIdModule from '../../domain/value-objects/RequestId'
import * as RequestAggregate from '../../domain/aggregates/Request'
import {
  UseCaseExecutionError,
  RequestNotFoundError,
} from '../errors/UseCaseError'
import { UnitOfWorkService } from '../services/UnitOfWorkService'

export interface HandleStreamChunkParams {
  readonly requestId: RequestId
  readonly chunk: StreamChunk
}

export class HandleStreamChunkUseCase {
  execute(
    params: HandleStreamChunkParams
  ): EffectType.Effect<
    Request,
    RequestNotFoundError | UseCaseExecutionError,
    UnitOfWorkService
  > {
    return Effect.acquireUseRelease(
      Effect.gen(function* () {
        const service = yield* UnitOfWorkService
        return yield* service.begin()
      }),

      (uow) =>
        Effect.gen(function* () {
          const request = yield* uow.requestRepository.findById(params.requestId)

          if (request === null) {
            return yield* Effect.fail(
              new RequestNotFoundError({
                requestId: RequestIdModule.unwrap(params.requestId),
                message: `Request with ID ${RequestIdModule.unwrap(params.requestId)} not found`,
              })
            )
          }

          const { request: updatedRequest } = yield* RequestAggregate.addChunk(
            request,
            params.chunk
          )

          yield* uow.requestRepository.save(updatedRequest)

          return updatedRequest
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
          Match.tag('RequestNotFoundError', (err) => err),
          Match.orElse((err) =>
            new UseCaseExecutionError({
              useCase: 'HandleStreamChunkUseCase',
              operation: 'execute',
              message: `Failed to handle stream chunk: ${err}`,
              cause: err as Error,
            })
          )
        )
      )
    )
  }
}
