import { SessionAgent, type Env } from './infrastructure/durable-objects/SessionAgent'

export { SessionAgent }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/session/')) {
      const sessionId = url.pathname.split('/')[2]
      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Session ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const id = env.SESSIONS.idFromName(sessionId)
      const stub = env.SESSIONS.get(id)

      return stub.fetch(request)
    }

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'cf_ai_session_router',
        timestamp: Date.now(),
      })
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
