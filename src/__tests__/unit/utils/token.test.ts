import { describe, it, expect } from 'vitest'
import { extractToken, extractSessionId } from '../../../utils'

const createRequest = (url: string, headers: Record<string, string> = {}): Request => {
  return new Request(url, { headers })
}

describe('token utils', () => {
  describe('extractToken', () => {
    it('should extract token from Authorization header', () => {
      const request = createRequest('https://example.com', {
        Authorization: 'Bearer my-jwt-token',
      })

      const token = extractToken(request)

      expect(token).toBe('my-jwt-token')
    })

    it('should extract token from query parameter', () => {
      const request = createRequest('https://example.com?token=query-token')

      const token = extractToken(request)

      expect(token).toBe('query-token')
    })

    it('should prefer Authorization header over query parameter', () => {
      const request = createRequest('https://example.com?token=query-token', {
        Authorization: 'Bearer header-token',
      })

      const token = extractToken(request)

      expect(token).toBe('header-token')
    })

    it('should return null when no token present', () => {
      const request = createRequest('https://example.com')

      const token = extractToken(request)

      expect(token).toBeNull()
    })

    it('should handle Authorization header without Bearer prefix', () => {
      const request = createRequest('https://example.com', {
        Authorization: 'some-token',
      })

      const token = extractToken(request)

      expect(token).toBe('some-token')
    })

    it('should return null for empty Authorization header', () => {
      const request = createRequest('https://example.com', {
        Authorization: '',
      })

      const token = extractToken(request)

      expect(token).toBeNull()
    })

    it('should handle empty query parameter', () => {
      const request = createRequest('https://example.com?token=')

      const token = extractToken(request)

      expect(token).toBe('')
    })
  })

  describe('extractSessionId', () => {
    it('should extract sessionId from path /session/{id}', () => {
      const request = createRequest('https://example.com/session/abc-123')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBe('abc-123')
    })

    it('should extract sessionId from nested path /api/session/{id}', () => {
      const request = createRequest('https://example.com/api/session/xyz-789')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBe('xyz-789')
    })

    it('should extract sessionId when path has trailing segments', () => {
      const request = createRequest('https://example.com/session/my-id/connect')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBe('my-id')
    })

    it('should return null when no session in path', () => {
      const request = createRequest('https://example.com/api/users')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBeNull()
    })

    it('should return null when session is last segment without id', () => {
      const request = createRequest('https://example.com/api/session')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBeNull()
    })

    it('should return null for empty segment after session', () => {
      const request = createRequest('https://example.com/session/')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBeNull()
    })

    it('should handle UUID-style session ids', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const request = createRequest(`https://example.com/session/${uuid}`)

      const sessionId = extractSessionId(request)

      expect(sessionId).toBe(uuid)
    })

    it('should be case-sensitive for session keyword', () => {
      const request = createRequest('https://example.com/Session/my-id')

      const sessionId = extractSessionId(request)

      expect(sessionId).toBeNull()
    })
  })
})
