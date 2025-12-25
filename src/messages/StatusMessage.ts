import { Data } from 'effect'
import type { SessionStatus, HomeServerStatus } from '../types'

export type StatusMessage = {
  readonly type: 'status'
  readonly protocolVersion: string
  readonly homeServer: HomeServerStatus
  readonly queueDepth: number
  readonly sessionState: SessionStatus
}

export const createStatusMessage = (
  params: Omit<StatusMessage, 'type'>
): StatusMessage =>
  Data.struct({
    type: 'status' as const,
    ...params,
  })

export const serializeStatusMessage = (message: StatusMessage): string =>
  JSON.stringify(message)
