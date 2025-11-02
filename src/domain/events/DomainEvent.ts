import type { SessionId } from '../value-objects/SessionId'
import type { RequestId } from '../value-objects/RequestId'
import type { ClientMessage } from '../value-objects/ClientMessage'
import type { StreamChunk } from '../value-objects/StreamChunk'

export type SessionEstablished = {
  readonly _tag: 'SessionEstablished'
  readonly sessionId: SessionId
  readonly timestamp: number
}

export type RequestReceived = {
  readonly _tag: 'RequestReceived'
  readonly requestId: RequestId
  readonly sessionId: SessionId
  readonly message: ClientMessage
  readonly timestamp: number
}

export type ResponseChunkReceived = {
  readonly _tag: 'ResponseChunkReceived'
  readonly requestId: RequestId
  readonly chunk: StreamChunk
  readonly timestamp: number
}

export type RequestCompleted = {
  readonly _tag: 'RequestCompleted'
  readonly requestId: RequestId
  readonly timestamp: number
}

export type RequestFailed = {
  readonly _tag: 'RequestFailed'
  readonly requestId: RequestId
  readonly error: string
  readonly timestamp: number
}

export type DomainEvent =
  | SessionEstablished
  | RequestReceived
  | ResponseChunkReceived
  | RequestCompleted
  | RequestFailed
