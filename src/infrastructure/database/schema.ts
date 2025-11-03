import { Schema } from '@effect/schema'


export class SessionRecord extends Schema.Class<SessionRecord>('SessionRecord')({
  session_id: Schema.String,
  state: Schema.Literal('Active', 'Closed'),
  established_at: Schema.Number,
  closed_at: Schema.optional(Schema.NullOr(Schema.Number)),
  close_reason: Schema.optional(Schema.NullOr(Schema.String)),
  request_ids: Schema.String, // JSON array stored as TEXT
}) {
  /**
   * SQL DDL for sessions table
   * - Uses snake_case for SQL convention
   * - Indexes on state and established_at for query performance
   */
  static readonly CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('Active', 'Closed')),
      established_at INTEGER NOT NULL,
      closed_at INTEGER,
      close_reason TEXT,
      request_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_established_at ON sessions(established_at);
  ` as const
}


export type RequestState = 'Pending' | 'Streaming' | 'Completed' | 'Failed'

