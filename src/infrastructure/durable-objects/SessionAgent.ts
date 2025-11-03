import type { DurableObjectState } from '@cloudflare/workers-types'

export interface Env {
  SESSIONS: DurableObjectNamespace
}

export class SessionAgent {
  constructor(
    public ctx: DurableObjectState,
    private env: Env
  ) {}

  async fetch(_request: Request): Promise<Response> {
    return new Response('OK', { status: 200 })
  }
}
