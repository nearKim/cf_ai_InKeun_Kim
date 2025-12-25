import { Data } from 'effect'
import type {
  SessionEstablished,
  SessionClosed,
  SessionIdled,
  SessionExpired,
  ClientConnected,
  ClientDisconnected,
  HomeServerConnected,
  HomeServerDisconnected,
  MessageQueued,
  QueueFlushed,
} from './DomainEvent'

export const makeSessionEstablished = (params: {
  sessionId: string
  timestamp?: number
}): SessionEstablished =>
  Data.struct({
    _tag: 'SessionEstablished' as const,
    sessionId: params.sessionId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeSessionClosed = (params: {
  sessionId: string
  reason?: string
  timestamp?: number
}): SessionClosed =>
  Data.struct({
    _tag: 'SessionClosed' as const,
    sessionId: params.sessionId,
    reason: params.reason,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeSessionIdled = (params: {
  sessionId: string
  timestamp?: number
}): SessionIdled =>
  Data.struct({
    _tag: 'SessionIdled' as const,
    sessionId: params.sessionId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeSessionExpired = (params: {
  sessionId: string
  timestamp?: number
}): SessionExpired =>
  Data.struct({
    _tag: 'SessionExpired' as const,
    sessionId: params.sessionId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeClientConnected = (params: {
  sessionId: string
  connectionId: string
  userId: string
  timestamp?: number
}): ClientConnected =>
  Data.struct({
    _tag: 'ClientConnected' as const,
    sessionId: params.sessionId,
    connectionId: params.connectionId,
    userId: params.userId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeClientDisconnected = (params: {
  sessionId: string
  connectionId: string
  reason?: string
  timestamp?: number
}): ClientDisconnected =>
  Data.struct({
    _tag: 'ClientDisconnected' as const,
    sessionId: params.sessionId,
    connectionId: params.connectionId,
    reason: params.reason,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeHomeServerConnected = (params: {
  sessionId: string
  homeServerUrl: string
  timestamp?: number
}): HomeServerConnected =>
  Data.struct({
    _tag: 'HomeServerConnected' as const,
    sessionId: params.sessionId,
    homeServerUrl: params.homeServerUrl,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeHomeServerDisconnected = (params: {
  sessionId: string
  reason?: string
  timestamp?: number
}): HomeServerDisconnected =>
  Data.struct({
    _tag: 'HomeServerDisconnected' as const,
    sessionId: params.sessionId,
    reason: params.reason,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeMessageQueued = (params: {
  sessionId: string
  messageId: string
  queueSize: number
  timestamp?: number
}): MessageQueued =>
  Data.struct({
    _tag: 'MessageQueued' as const,
    sessionId: params.sessionId,
    messageId: params.messageId,
    queueSize: params.queueSize,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeQueueFlushed = (params: {
  sessionId: string
  messageCount: number
  timestamp?: number
}): QueueFlushed =>
  Data.struct({
    _tag: 'QueueFlushed' as const,
    sessionId: params.sessionId,
    messageCount: params.messageCount,
    timestamp: params.timestamp ?? Date.now(),
  })
