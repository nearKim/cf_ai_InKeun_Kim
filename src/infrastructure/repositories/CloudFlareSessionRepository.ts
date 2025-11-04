import { Effect, Data } from 'effect'
import type { Session } from '../../domain/aggregates/Session'
import type { SessionId } from '../../domain/value-objects/SessionId'
import type { SessionRepository } from '../../domain/repositories/SessionRepository'
import { RepositoryError } from '../../domain/repositories/errors'
import * as SessionIdModule from '../../domain/value-objects/SessionId'
import * as RequestIdModule from '../../domain/value-objects/RequestId'
import type { SqlExecutor } from '../database/sqlExecutor'

interface SessionRow extends Record<string, SqlStorageValue> {
  session_id: string
  state: string
  established_at: number
  closed_at: number | null
  close_reason: string | null
  request_ids: string
}

export class CloudFlareSessionRepository implements SessionRepository {
  constructor(private readonly sqlExecutor: SqlExecutor) {}

  findById(id: SessionId): Effect.Effect<Session | null, RepositoryError> {
    const self = this
    return Effect.gen(function* () {
      const sessionIdStr = SessionIdModule.unwrap(id)

      const rows = yield* self.sqlExecutor
        .execute<SessionRow>(
          'SELECT * FROM sessions WHERE session_id = ?',
          sessionIdStr
        )
        .pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                operation: 'findById',
                message: `Failed to find session: ${error.message}`,
                cause: error,
              })
          )
        )

      if (rows.length === 0) {
        return null
      }

      return yield* self.rowToAggregate(rows[0]!)
    })
  }

  save(session: Session): Effect.Effect<void, RepositoryError> {
    const self = this
    return Effect.gen(function* () {
      const row = self.aggregateToRow(session)

      yield* self.sqlExecutor
        .execute(
          `INSERT OR REPLACE INTO sessions
           (session_id, state, established_at, closed_at, close_reason, request_ids)
           VALUES (?, ?, ?, ?, ?, ?)`,
          row.session_id,
          row.state,
          row.established_at,
          row.closed_at,
          row.close_reason,
          row.request_ids
        )
        .pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                operation: 'save',
                message: `Failed to save session: ${error.message}`,
                cause: error,
              })
          )
        )
    })
  }

  delete(id: SessionId): Effect.Effect<void, RepositoryError> {
    const self = this
    return Effect.gen(function* () {
      const sessionIdStr = SessionIdModule.unwrap(id)

      yield* self.sqlExecutor
        .execute('DELETE FROM sessions WHERE session_id = ?', sessionIdStr)
        .pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                operation: 'delete',
                message: `Failed to delete session: ${error.message}`,
                cause: error,
              })
          )
        )
    })
  }

  exists(id: SessionId): Effect.Effect<boolean, RepositoryError> {
    const self = this
    return Effect.gen(function* () {
      const sessionIdStr = SessionIdModule.unwrap(id)

      const rows = yield* self.sqlExecutor
        .execute(
          'SELECT 1 FROM sessions WHERE session_id = ? LIMIT 1',
          sessionIdStr
        )
        .pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                operation: 'exists',
                message: `Failed to check session existence: ${error.message}`,
                cause: error,
              })
          )
        )

      return rows.length > 0
    })
  }

  private aggregateToRow(session: Session): Readonly<{
    session_id: string
    state: string
    established_at: number
    closed_at: number | null
    close_reason: string | null
    request_ids: string
  }> {
    return {
      session_id: SessionIdModule.unwrap(session.sessionId),
      state: session.state,
      established_at: session.establishedAt,
      closed_at: session.closedAt ?? null,
      close_reason: session.closeReason ?? null,
      request_ids: JSON.stringify(
        session.requestIds.map((id) => RequestIdModule.unwrap(id))
      ),
    }
  }

  private rowToAggregate(
    row: SessionRow
  ): Effect.Effect<Session, RepositoryError> {
    return Effect.gen(function* () {
      const sessionId = yield* SessionIdModule.make(row.session_id).pipe(
        Effect.mapError(
          (error) =>
            new RepositoryError({
              operation: 'rowToAggregate',
              message: `Failed to parse sessionId: ${error.message}`,
              cause: error,
            })
        )
      )

      if (row.state !== 'Active' && row.state !== 'Closed') {
        return yield* Effect.fail(
          new RepositoryError({
            operation: 'rowToAggregate',
            message: `Invalid state in database: '${row.state}'. Expected 'Active' or 'Closed'.`,
          })
        )
      }

      const requestIdStrings = yield* Effect.try({
        try: (): string[] => {
          const parsed = JSON.parse(row.request_ids)
          if (!Array.isArray(parsed)) {
            throw new Error('request_ids is not an array')
          }
          return parsed
        },
        catch: (error) =>
          new RepositoryError({
            operation: 'rowToAggregate',
            message: `Failed to parse request_ids JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
            cause: error,
          }),
      })

      const requestIds = yield* Effect.all(
        requestIdStrings.map((idStr) =>
          RequestIdModule.make(idStr).pipe(
            Effect.mapError(
              (error) =>
                new RepositoryError({
                  operation: 'rowToAggregate',
                  message: `Failed to parse requestId '${idStr}': ${error.message}`,
                  cause: error,
                })
            )
          )
        )
      )

      const session: Session = Data.struct({
        sessionId,
        state: row.state as 'Active' | 'Closed',
        requestIds,
        establishedAt: row.established_at,
        closedAt: row.closed_at ?? undefined,
        closeReason: row.close_reason ?? undefined,
      })

      return session
    })
  }
}