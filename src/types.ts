export interface Env {
  SessionAgent: DurableObjectNamespace
  AUTH_SECRET_KEY: string
  ALLOWED_ORIGIN?: string
  ALLOWED_HOME_SERVER_PATTERN?: string
  MESSAGE_QUEUE_LIMIT?: string
}

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

export type MessageQueueRow = {
  id: string
  envelope_json: string
  queued_at: number
}
