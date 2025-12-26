import { Effect, Ref, HashMap, pipe, Option } from 'effect'
import type { Connection } from '@cloudflare/agents'
import type { ConnectionState } from '../types'

type ClientConnection = Connection<ConnectionState>

export interface ClientRegistry {
  readonly add: (id: string, conn: ClientConnection) => Effect.Effect<void>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly get: (id: string) => Effect.Effect<ClientConnection | undefined>
  readonly getAll: () => Effect.Effect<ReadonlyArray<ClientConnection>>
  readonly size: () => Effect.Effect<number>
  readonly broadcast: (message: string) => Effect.Effect<void>
  readonly isEmpty: () => Effect.Effect<boolean>
}

export const createClientRegistry = (): Effect.Effect<ClientRegistry> =>
  Effect.gen(function* () {
    const connectionsRef = yield* Ref.make(
      HashMap.empty<string, ClientConnection>()
    )

    return {
      add: (id, conn) =>
        Ref.update(connectionsRef, HashMap.set(id, conn)),

      remove: (id) =>
        Ref.update(connectionsRef, HashMap.remove(id)),

      get: (id) =>
        pipe(
          Ref.get(connectionsRef),
          Effect.map(HashMap.get(id)),
          Effect.map(Option.getOrUndefined)
        ),

      getAll: () =>
        pipe(
          Ref.get(connectionsRef),
          Effect.map((map) => Array.from(HashMap.values(map)))
        ),

      size: () =>
        pipe(Ref.get(connectionsRef), Effect.map(HashMap.size)),

      broadcast: (message) =>
        pipe(
          Ref.get(connectionsRef),
          Effect.flatMap((map) =>
            Effect.forEach(
              Array.from(HashMap.values(map)),
              (conn: ClientConnection) =>
                pipe(
                  Effect.try(() => conn.send(message)),
                  Effect.ignore
                ),
              { discard: true }
            )
          )
        ),

      isEmpty: () =>
        pipe(Ref.get(connectionsRef), Effect.map(HashMap.isEmpty)),
    }
  })
