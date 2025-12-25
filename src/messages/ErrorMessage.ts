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

export const createErrorMessage = (
  params: Omit<ErrorMessage, 'type'>
): ErrorMessage =>
  Data.struct({
    type: 'error' as const,
    ...params,
  })

export const serializeErrorMessage = (message: ErrorMessage): string =>
  JSON.stringify(message)

export const queueFullError = (retryAfter = 60): ErrorMessage =>
  createErrorMessage({
    code: 'QUEUE_FULL',
    message: 'Message queue is full. Please try again later.',
    retryable: true,
    retryAfter,
  })

export const invalidMessageError = (reason: string): ErrorMessage =>
  createErrorMessage({
    code: 'INVALID_MESSAGE',
    message: `Invalid message: ${reason}`,
    retryable: false,
  })

export const authFailedError = (reason: string): ErrorMessage =>
  createErrorMessage({
    code: 'AUTH_FAILED',
    message: reason,
    retryable: false,
  })

export const sessionExpiredError = (): ErrorMessage =>
  createErrorMessage({
    code: 'SESSION_EXPIRED',
    message: 'Session has expired',
    retryable: false,
  })

export const homeServerError = (reason: string): ErrorMessage =>
  createErrorMessage({
    code: 'HOME_SERVER_ERROR',
    message: `Home server error: ${reason}`,
    retryable: true,
    retryAfter: 30,
  })
