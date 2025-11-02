import { Effect, Exit } from 'effect'
import type * as EffectType from 'effect/Effect'
import type { UnitOfWork } from '../../domain/repositories/UnitOfWork'
import { UnitOfWorkService } from '../services/UnitOfWorkService'

export const beginTransaction = () =>
  Effect.gen(function* () {
    const service = yield* UnitOfWorkService
    return yield* service.begin()
  })

export const handleTransactionRelease = (
  uow: UnitOfWork,
  exit: Exit.Exit<unknown, unknown>
) =>
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

export const withTransaction = <A, E, R>(
  operation: (uow: UnitOfWork) => EffectType.Effect<A, E, R>
): EffectType.Effect<A, E, R | UnitOfWorkService> =>
  Effect.acquireUseRelease(
    beginTransaction(),
    operation,
    handleTransactionRelease
  ) as EffectType.Effect<A, E, R | UnitOfWorkService>
