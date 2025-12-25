export type SessionEstablished = {
  readonly _tag: 'SessionEstablished'
  readonly sessionId: string
  readonly timestamp: number
}

export type SessionClosed = {
  readonly _tag: 'SessionClosed'
  readonly sessionId: string
  readonly reason?: string
  readonly timestamp: number
}

export type SessionIdled = {
  readonly _tag: 'SessionIdled'
  readonly sessionId: string
  readonly timestamp: number
}

export type SessionExpired = {
  readonly _tag: 'SessionExpired'
  readonly sessionId: string
  readonly timestamp: number
}

export type ClientConnected = {
  readonly _tag: 'ClientConnected'
  readonly sessionId: string
  readonly connectionId: string
  readonly userId: string
  readonly timestamp: number
}

export type ClientDisconnected = {
  readonly _tag: 'ClientDisconnected'
  readonly sessionId: string
  readonly connectionId: string
  readonly reason?: string
  readonly timestamp: number
}

export type HomeServerConnected = {
  readonly _tag: 'HomeServerConnected'
  readonly sessionId: string
  readonly homeServerUrl: string
  readonly timestamp: number
}

export type HomeServerDisconnected = {
  readonly _tag: 'HomeServerDisconnected'
  readonly sessionId: string
  readonly reason?: string
  readonly timestamp: number
}

export type MessageQueued = {
  readonly _tag: 'MessageQueued'
  readonly sessionId: string
  readonly messageId: string
  readonly queueSize: number
  readonly timestamp: number
}

export type QueueFlushed = {
  readonly _tag: 'QueueFlushed'
  readonly sessionId: string
  readonly messageCount: number
  readonly timestamp: number
}

export type DomainEvent =
  | SessionEstablished
  | SessionClosed
  | SessionIdled
  | SessionExpired
  | ClientConnected
  | ClientDisconnected
  | HomeServerConnected
  | HomeServerDisconnected
  | MessageQueued
  | QueueFlushed
