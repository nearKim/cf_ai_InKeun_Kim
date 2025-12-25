export type SessionStatus = 'Active' | 'Idle' | 'Closed'

export type HomeServerStatus = 'online' | 'offline' | 'connecting'

export type SessionState = {
  readonly sessionId: string
  readonly status: SessionStatus
  readonly homeServer: HomeServerStatus
  readonly queueDepth: number
  readonly createdAt: number
  readonly lastActivityAt: number
}

export type ConnectionState = {
  readonly connectionId: string
  readonly authenticatedAt: number
  readonly userId: string
}
