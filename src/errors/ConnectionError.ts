import { Data } from 'effect'

export class HomeServerConnectionError extends Data.TaggedError('HomeServerConnectionError')<{
  readonly url: string
  readonly reason: string
}> {}

export class HomeServerSendError extends Data.TaggedError('HomeServerSendError')<{
  readonly message: string
  readonly reason: 'not_connected' | 'send_failed'
}> {}

export class HomeServerDisconnectedError extends Data.TaggedError('HomeServerDisconnectedError')<{
  readonly url: string
  readonly code: number
  readonly reason: string
}> {}

export type HomeServerError =
  | HomeServerConnectionError
  | HomeServerSendError
  | HomeServerDisconnectedError

export class ClientConnectionError extends Data.TaggedError('ClientConnectionError')<{
  readonly connectionId: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class ProtocolVersionError extends Data.TaggedError('ProtocolVersionError')<{
  readonly expected: string
  readonly received: string
}> {}
