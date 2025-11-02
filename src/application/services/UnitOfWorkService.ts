import { Context, Effect, Layer } from 'effect'
import type { UnitOfWork, TransactionError } from '../../domain/repositories/UnitOfWork'
import type { SessionRepository } from '../../domain/repositories/SessionRepository'
import type { RequestRepository } from '../../domain/repositories/RequestRepository'

export class SessionRepositoryTag extends Context.Tag('SessionRepository')<
  SessionRepositoryTag,
  SessionRepository
>() {}

export class RequestRepositoryTag extends Context.Tag('RequestRepository')<
  RequestRepositoryTag,
  RequestRepository
>() {}

export class UnitOfWorkService extends Context.Tag('UnitOfWorkService')<
  UnitOfWorkService,
  {
    readonly begin: () => Effect.Effect<UnitOfWork, TransactionError, never>
  }
>() {
  static readonly Live = Layer.effect(
    UnitOfWorkService,
    Effect.gen(function* () {
      const sessionRepository = yield* SessionRepositoryTag
      const requestRepository = yield* RequestRepositoryTag

      return UnitOfWorkService.of({
        begin: () =>
          Effect.succeed({
            sessionRepository,
            requestRepository,
            commit: () => Effect.void,
            rollback: () => Effect.void,
          }),
      })
    })
  )
}
