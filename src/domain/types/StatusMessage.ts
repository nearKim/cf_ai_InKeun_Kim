import { Data } from 'effect'
import type { SessionStatus, HomeServerStatus } from '../aggregates/Session'

export type StatusMessage = {
  readonly type: 'status'
  readonly homeServer: HomeServerStatus
  readonly queueDepth: number
  readonly sessionState: SessionStatus
}

export const create = (params: {
  homeServer: HomeServerStatus
  queueDepth: number
  sessionState: SessionStatus
}): StatusMessage =>
  Data.struct({
    type: 'status' as const,
    homeServer: params.homeServer,
    queueDepth: params.queueDepth,
    sessionState: params.sessionState,
  })

export const serialize = (message: StatusMessage): string => JSON.stringify(message)
