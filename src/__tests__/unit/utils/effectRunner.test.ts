import { describe, it, expect, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { createEffectRunner } from '../../../utils'

class TestError extends Error {
  readonly _tag = 'TestError' as const
  constructor(message: string) {
    super(message)
    this.name = 'TestError'
  }
}

describe('EffectRunner', () => {
  describe('runExit', () => {
    it('should return success exit for successful effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.succeed(42)

      const exit = await runner.runExit(effect)

      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toBe(42)
      }
    })

    it('should return failure exit for failed effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('failed'))

      const exit = await runner.runExit(effect)

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should preserve error type', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('typed error'))

      const exit = await runner.runExit(effect)

      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe('runPromise', () => {
    it('should return value for successful effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.succeed('hello')

      const result = await runner.runPromise(effect)

      expect(result).toBe('hello')
    })

    it('should throw for failed effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('error'))

      await expect(runner.runPromise(effect)).rejects.toThrow()
    })

    it('should handle async effects', async () => {
      const runner = createEffectRunner()
      const effect = Effect.promise(async () => {
        await new Promise((r) => setTimeout(r, 10))
        return 'async result'
      })

      const result = await runner.runPromise(effect)

      expect(result).toBe('async result')
    })
  })

  describe('runSync', () => {
    it('should return value for sync effect', () => {
      const runner = createEffectRunner()
      const effect = Effect.sync(() => 123)

      const result = runner.runSync(effect)

      expect(result).toBe(123)
    })

    it('should throw for failed effect', () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('sync error'))

      expect(() => runner.runSync(effect)).toThrow()
    })
  })

  describe('runWithHandler', () => {
    it('should call onSuccess for successful effect', async () => {
      const runner = createEffectRunner()
      const onSuccess = vi.fn()
      const onFailure = vi.fn()
      const effect = Effect.succeed('value')

      runner.runWithHandler(effect, { onSuccess, onFailure })

      await new Promise((r) => setTimeout(r, 10))

      expect(onSuccess).toHaveBeenCalledWith('value')
      expect(onFailure).not.toHaveBeenCalled()
    })

    it('should call onFailure for failed effect', async () => {
      const runner = createEffectRunner()
      const onSuccess = vi.fn()
      const onFailure = vi.fn()
      const error = new TestError('handler error')
      const effect = Effect.fail(error)

      runner.runWithHandler(effect, { onSuccess, onFailure })

      await new Promise((r) => setTimeout(r, 10))

      expect(onSuccess).not.toHaveBeenCalled()
      expect(onFailure).toHaveBeenCalledWith(error)
    })

    it('should handle complex effects', async () => {
      const runner = createEffectRunner()
      const onSuccess = vi.fn()
      const onFailure = vi.fn()
      const effect = Effect.gen(function* () {
        const a = yield* Effect.succeed(1)
        const b = yield* Effect.succeed(2)
        return a + b
      })

      runner.runWithHandler(effect, { onSuccess, onFailure })

      await new Promise((r) => setTimeout(r, 10))

      expect(onSuccess).toHaveBeenCalledWith(3)
    })
  })

  describe('runOrDefault', () => {
    it('should return value for successful effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.succeed('actual')

      const result = await runner.runOrDefault(effect, 'default')

      expect(result).toBe('actual')
    })

    it('should return default for failed effect', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('error'))

      const result = await runner.runOrDefault(effect, 'default')

      expect(result).toBe('default')
    })

    it('should return default for any error type', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail('string error')

      const result = await runner.runOrDefault(effect, 42)

      expect(result).toBe(42)
    })

    it('should handle null default', async () => {
      const runner = createEffectRunner()
      const effect = Effect.fail(new TestError('error'))

      const result = await runner.runOrDefault(effect, null)

      expect(result).toBeNull()
    })
  })

  describe('createEffectRunner', () => {
    it('should create new instance', () => {
      const runner1 = createEffectRunner()
      const runner2 = createEffectRunner()

      expect(runner1).not.toBe(runner2)
    })
  })
})
