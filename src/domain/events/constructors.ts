import { Data } from 'effect'
import type { SessionId } from '../value-objects/SessionId'
import type { RequestId } from '../value-objects/RequestId'
import type { ClientMessage } from '../value-objects/ClientMessage'
import type { StreamChunk } from '../value-objects/StreamChunk'
import type {
  SessionEstablished,
  RequestReceived,
  ResponseChunkReceived,
  RequestCompleted,
  RequestFailed,
} from './DomainEvent'

export const makeSessionEstablished = (params: {
  sessionId: SessionId
  timestamp?: number
}): SessionEstablished =>
  Data.struct({
    _tag: 'SessionEstablished' as const,
    sessionId: params.sessionId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeRequestReceived = (params: {
  requestId: RequestId
  sessionId: SessionId
  message: ClientMessage
  timestamp?: number
}): RequestReceived =>
  Data.struct({
    _tag: 'RequestReceived' as const,
    requestId: params.requestId,
    sessionId: params.sessionId,
    message: params.message,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeResponseChunkReceived = (params: {
  requestId: RequestId
  chunk: StreamChunk
  timestamp?: number
}): ResponseChunkReceived =>
  Data.struct({
    _tag: 'ResponseChunkReceived' as const,
    requestId: params.requestId,
    chunk: params.chunk,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeRequestCompleted = (params: {
  requestId: RequestId
  timestamp?: number
}): RequestCompleted =>
  Data.struct({
    _tag: 'RequestCompleted' as const,
    requestId: params.requestId,
    timestamp: params.timestamp ?? Date.now(),
  })

export const makeRequestFailed = (params: {
  requestId: RequestId
  error: string
  timestamp?: number
}): RequestFailed =>
  Data.struct({
    _tag: 'RequestFailed' as const,
    requestId: params.requestId,
    error: params.error,
    timestamp: params.timestamp ?? Date.now(),
  })
