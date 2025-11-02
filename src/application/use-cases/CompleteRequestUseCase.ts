import { Effect } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { RequestId } from '../../domain/value-objects/RequestId'
import type { Request } from '../../domain/aggregates/Request'
import * as RequestAggregate from '../../domain/aggregates/Request'
import { UnitOfWorkService } from '../services/UnitOfWorkService'
import { withTransaction } from '../utils/transaction'
import { createRequestNotFoundError } from '../errors/factories'
import { mapUseCaseError } from '../utils/errorMapping'
import type {
  RequestNotFoundError,
  UseCaseExecutionError,
} from '../errors/UseCaseError'

export interface CompleteRequestParams {
  readonly requestId: RequestId
  readonly metadata?: {
    totalTokens?: number
    stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence'
  }
}

export class CompleteRequestUseCase {
  execute(
    params: CompleteRequestParams
  ): EffectType.Effect<
    Request,
    RequestNotFoundError | UseCaseExecutionError,
    UnitOfWorkService
  > {
    return withTransaction((uow) =>
      Effect.gen(function* () {
        const request = yield* uow.requestRepository.findById(params.requestId)

        if (request === null) {
          return yield* Effect.fail(createRequestNotFoundError(params.requestId))
        }

        const { request: updatedRequest } = yield* RequestAggregate.complete(
          request,
          params.metadata
        )

        yield* uow.requestRepository.save(updatedRequest)

        return updatedRequest
      })
    ).pipe(mapUseCaseError('CompleteRequestUseCase', ['RequestNotFoundError']))
  }
}
