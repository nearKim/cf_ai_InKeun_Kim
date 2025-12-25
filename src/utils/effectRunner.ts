import { Effect, Runtime, Exit, Cause, Option } from 'effect'

export class EffectRunner {
  private readonly runtime = Runtime.defaultRuntime

  runExit<A, E>(effect: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> {
    return Runtime.runPromiseExit(this.runtime)(effect)
  }

  runPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
    return Runtime.runPromise(this.runtime)(effect)
  }

  runSync<A, E>(effect: Effect.Effect<A, E>): A {
    return Runtime.runSync(this.runtime)(effect)
  }

  runWithHandler<A, E>(
    effect: Effect.Effect<A, E>,
    handlers: {
      onSuccess: (value: A) => void
      onFailure: (error: E) => void
    }
  ): void {
    this.runExit(effect).then((exit) => {
      if (Exit.isSuccess(exit)) {
        handlers.onSuccess(exit.value)
      } else {
        const errorOption = Cause.failureOption(exit.cause)
        if (Option.isSome(errorOption)) {
          handlers.onFailure(errorOption.value)
        }
      }
    })
  }

  async runOrDefault<A, E>(effect: Effect.Effect<A, E>, defaultValue: A): Promise<A> {
    const exit = await this.runExit(effect)
    return Exit.isSuccess(exit) ? exit.value : defaultValue
  }
}

export const createEffectRunner = (): EffectRunner => new EffectRunner()
