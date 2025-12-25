import { routeAgentRequest } from '@cloudflare/agents'
import { SessionAgent } from './agent'
import type { Env } from './types'

export { SessionAgent }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await routeAgentRequest(request, env)
    if (response) {
      return response
    }

    return new Response('Not Found', { status: 404 })
  },
}
