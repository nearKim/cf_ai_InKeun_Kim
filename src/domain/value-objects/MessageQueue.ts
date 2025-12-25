import type { MessageEnvelope } from '../types/MessageEnvelope'

export type QueuedMessage = {
  readonly id: string
  readonly envelope: MessageEnvelope
  readonly queuedAt: number
}

export type MessageQueueConfig = {
  readonly limit: number
}

export const DEFAULT_CONFIG: MessageQueueConfig = {
  limit: 100,
}

export type MessageQueueRow = {
  id: string
  envelope_json: string
  queued_at: number
}

export const toRow = (message: QueuedMessage): MessageQueueRow => ({
  id: message.id,
  envelope_json: JSON.stringify(message.envelope),
  queued_at: message.queuedAt,
})

export const fromRow = (row: MessageQueueRow): QueuedMessage => ({
  id: row.id,
  envelope: JSON.parse(row.envelope_json) as MessageEnvelope,
  queuedAt: row.queued_at,
})

export const createQueuedMessage = (envelope: MessageEnvelope): QueuedMessage => ({
  id: envelope.id,
  envelope,
  queuedAt: Date.now(),
})

export const SQL = {
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY,
      envelope_json TEXT NOT NULL,
      queued_at INTEGER NOT NULL
    )
  `,
  COUNT: 'SELECT COUNT(*) as count FROM message_queue',
  INSERT: 'INSERT INTO message_queue (id, envelope_json, queued_at) VALUES (?, ?, ?)',
  SELECT_ALL_FIFO: 'SELECT id, envelope_json, queued_at FROM message_queue ORDER BY queued_at ASC',
  DELETE_BY_ID: 'DELETE FROM message_queue WHERE id = ?',
  DELETE_ALL: 'DELETE FROM message_queue',
} as const
