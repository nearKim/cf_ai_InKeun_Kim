import { Effect } from 'effect'
import { UseCaseExecutionError } from '../errors/UseCaseError'

export const mapUseCaseError = (
  useCaseName: string,
  knownErrorTags: readonly string[]
) =>
  Effect.mapError((error: any) => {
    if (error && typeof error === 'object' && '_tag' in error) {
      if (knownErrorTags.includes(error._tag)) {
        return error
      }
    }

    return new UseCaseExecutionError({
      useCase: useCaseName,
      operation: 'execute',
      message: `Failed to execute ${useCaseName}: ${error}`,
      cause: error as Error,
    })
  })
