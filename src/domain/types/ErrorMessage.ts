import { Data } from 'effect'

export type ErrorCode =
  | 'QUEUE_FULL'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'INVALID_MESSAGE'
  | 'HOME_SERVER_ERROR'

export type ErrorMessage = {
  readonly type: 'error'
  readonly code: ErrorCode
  readonly message: string
  readonly retryable: boolean
  readonly retryAfter?: number
}

export const create = (params: {
  code: ErrorCode
  message: string
  retryable: boolean
  retryAfter?: number
}): ErrorMessage =>
  Data.struct({
    type: 'error' as const,
    code: params.code,
    message: params.message,
    retryable: params.retryable,
    retryAfter: params.retryAfter,
  })

export const serialize = (message: ErrorMessage): string => JSON.stringify(message)

export const queueFull = (retryAfter = 60): ErrorMessage =>
  create({
    code: 'QUEUE_FULL',
    message: 'Message queue is full. Please try again later.',
    retryable: true,
    retryAfter,
  })

export const authFailed = (reason: string): ErrorMessage =>
  create({
    code: 'AUTH_FAILED',
    message: `Authentication failed: ${reason}`,
    retryable: false,
  })

export const sessionExpired = (): ErrorMessage =>
  create({
    code: 'SESSION_EXPIRED',
    message: 'Session has expired. Please start a new session.',
    retryable: false,
  })

export const invalidMessage = (reason: string): ErrorMessage =>
  create({
    code: 'INVALID_MESSAGE',
    message: `Invalid message: ${reason}`,
    retryable: false,
  })

export const homeServerError = (reason: string): ErrorMessage =>
  create({
    code: 'HOME_SERVER_ERROR',
    message: `Home server error: ${reason}`,
    retryable: true,
    retryAfter: 5,
  })
