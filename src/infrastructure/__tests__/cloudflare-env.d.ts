/**
 * CloudFlare Test Environment Type Declarations
 *
 * Extends the ProvidedEnv interface from 'cloudflare:test'
 * to include our Durable Object bindings for type safety in tests
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types'

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    SESSIONS: DurableObjectNamespace
  }
}
