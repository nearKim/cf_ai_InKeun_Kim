import { Data } from 'effect'

export class HomeServerConnectionError extends Data.TaggedError('HomeServerConnectionError')<{
  readonly url: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class ClientConnectionError extends Data.TaggedError('ClientConnectionError')<{
  readonly connectionId: string
  readonly message: string
  readonly cause?: unknown
}> {}
