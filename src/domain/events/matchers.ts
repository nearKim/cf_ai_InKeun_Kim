import type {
  DomainEvent,
  SessionEstablished,
  RequestReceived,
  ResponseChunkReceived,
  RequestCompleted,
  RequestFailed,
} from './DomainEvent'

export const matchEvent =
  <R>(patterns: {
    SessionEstablished: (event: SessionEstablished) => R
    RequestReceived: (event: RequestReceived) => R
    ResponseChunkReceived: (event: ResponseChunkReceived) => R
    RequestCompleted: (event: RequestCompleted) => R
    RequestFailed: (event: RequestFailed) => R
  }) =>
  (event: DomainEvent): R => {
    switch (event._tag) {
      case 'SessionEstablished':
        return patterns.SessionEstablished(event)
      case 'RequestReceived':
        return patterns.RequestReceived(event)
      case 'ResponseChunkReceived':
        return patterns.ResponseChunkReceived(event)
      case 'RequestCompleted':
        return patterns.RequestCompleted(event)
      case 'RequestFailed':
        return patterns.RequestFailed(event)
    }
  }
