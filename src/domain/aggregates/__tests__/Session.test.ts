import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as SessionId from '../../value-objects/SessionId'
import * as RequestId from '../../value-objects/RequestId'
import * as Session from '../Session'

describe('Session Aggregate', () => {
  describe('establish', () => {
    it('should create a new Session in Active state', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(Session.establish({ sessionId }))

      //Then
      expect(result.session.sessionId).toBe(sessionId)
      expect(result.session.state).toBe('Active')
      expect(result.session.requestIds).toEqual([])
      expect(result.session.establishedAt).toBeGreaterThan(0)
      expect(result.session.closedAt).toBeUndefined()
      expect(result.session.closeReason).toBeUndefined()
    })

    it('should emit SessionEstablished event', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())

      //When
      const result = Effect.runSync(Session.establish({ sessionId }))

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('SessionEstablished')
      if (event._tag === 'SessionEstablished') {
        expect(event.sessionId).toBe(sessionId)
      }
    })

    it('should create Session with custom timestamp', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const customTimestamp = 1234567890000

      //When
      const result = Effect.runSync(
        Session.establish({ sessionId, timestamp: customTimestamp })
      )

      //Then
      expect(result.session.establishedAt).toBe(customTimestamp)
    })
  })

  describe('addRequest', () => {
    it('should add requestId to Active session', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))
      const requestId = Effect.runSync(RequestId.generate())

      //When
      const result = Effect.runSync(Session.addRequest(session, requestId))

      //Then
      expect(result.session.requestIds).toHaveLength(1)
      expect(result.session.requestIds[0]).toBe(requestId)
      expect(result.session.state).toBe('Active')
    })

    it('should not emit events when adding request', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))
      const requestId = Effect.runSync(RequestId.generate())

      //When
      const result = Effect.runSync(Session.addRequest(session, requestId))

      //Then
      expect(result.events).toHaveLength(0)
    })

    it('should accumulate multiple requestIds', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session: session1 } = Effect.runSync(
        Session.establish({ sessionId })
      )
      const requestId1 = Effect.runSync(RequestId.generate())
      const { session: session2 } = Effect.runSync(
        Session.addRequest(session1, requestId1)
      )
      const requestId2 = Effect.runSync(RequestId.generate())

      //When
      const result = Effect.runSync(Session.addRequest(session2, requestId2))

      //Then
      expect(result.session.requestIds).toHaveLength(2)
      expect(result.session.requestIds[0]).toBe(requestId1)
      expect(result.session.requestIds[1]).toBe(requestId2)
    })

    it('should allow duplicate requestIds', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session: session1 } = Effect.runSync(
        Session.establish({ sessionId })
      )
      const requestId = Effect.runSync(RequestId.generate())
      const { session: session2 } = Effect.runSync(
        Session.addRequest(session1, requestId)
      )

      //When
      const result = Effect.runSync(Session.addRequest(session2, requestId))

      //Then
      expect(result.session.requestIds).toHaveLength(2)
      expect(result.session.requestIds[0]).toBe(requestId)
      expect(result.session.requestIds[1]).toBe(requestId)
    })

    it('should fail when adding request to Closed session', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session: session1 } = Effect.runSync(
        Session.establish({ sessionId })
      )
      const { session: closedSession } = Effect.runSync(
        Session.close(session1)
      )
      const requestId = Effect.runSync(RequestId.generate())

      //When & Then
      expect(() =>
        Effect.runSync(Session.addRequest(closedSession, requestId))
      ).toThrow()
    })
  })

  describe('close', () => {
    it('should transition from Active to Closed', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))

      //When
      const result = Effect.runSync(Session.close(session))

      //Then
      expect(result.session.state).toBe('Closed')
      expect(result.session.closedAt).toBeGreaterThan(0)
    })

    it('should emit SessionClosed event', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))

      //When
      const result = Effect.runSync(Session.close(session))

      //Then
      expect(result.events).toHaveLength(1)
      const event = result.events[0]!
      expect(event._tag).toBe('SessionClosed')
      if (event._tag === 'SessionClosed') {
        expect(event.sessionId).toBe(sessionId)
        expect(event.reason).toBeUndefined()
      }
    })

    it('should close session with reason', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))
      const reason = 'client_disconnect'

      //When
      const result = Effect.runSync(Session.close(session, reason))

      //Then
      expect(result.session.closeReason).toBe(reason)
      const event = result.events[0]!
      if (event._tag === 'SessionClosed') {
        expect(event.reason).toBe(reason)
      }
    })

    it('should close session with custom timestamp', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session } = Effect.runSync(Session.establish({ sessionId }))
      const customTimestamp = 1234567890000

      //When
      const result = Effect.runSync(
        Session.close(session, undefined, customTimestamp)
      )

      //Then
      expect(result.session.closedAt).toBe(customTimestamp)
    })

    it('should fail when closing already Closed session', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      const { session: session1 } = Effect.runSync(
        Session.establish({ sessionId })
      )
      const { session: closedSession } = Effect.runSync(
        Session.close(session1)
      )

      //When & Then
      expect(() => Effect.runSync(Session.close(closedSession))).toThrow()
    })
  })

  describe('Queries', () => {
    describe('isActive', () => {
      it('should return true for Active session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))

        //When & Then
        expect(Session.isActive(session)).toBe(true)
      })

      it('should return false for Closed session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId })
        )
        const { session: closedSession } = Effect.runSync(
          Session.close(session1)
        )

        //When & Then
        expect(Session.isActive(closedSession)).toBe(false)
      })
    })

    describe('isClosed', () => {
      it('should return true for Closed session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId })
        )
        const { session: closedSession } = Effect.runSync(
          Session.close(session1)
        )

        //When & Then
        expect(Session.isClosed(closedSession)).toBe(true)
      })

      it('should return false for Active session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))

        //When & Then
        expect(Session.isClosed(session)).toBe(false)
      })
    })

    describe('getRequestIds', () => {
      it('should return all requestIds', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId })
        )
        const requestId1 = Effect.runSync(RequestId.generate())
        const { session: session2 } = Effect.runSync(
          Session.addRequest(session1, requestId1)
        )
        const requestId2 = Effect.runSync(RequestId.generate())
        const { session: session3 } = Effect.runSync(
          Session.addRequest(session2, requestId2)
        )

        //When
        const requestIds = Session.getRequestIds(session3)

        //Then
        expect(requestIds).toHaveLength(2)
        expect(requestIds[0]).toBe(requestId1)
        expect(requestIds[1]).toBe(requestId2)
      })

      it('should return empty array for new session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))

        //When
        const requestIds = Session.getRequestIds(session)

        //Then
        expect(requestIds).toEqual([])
      })
    })

    describe('getRequestCount', () => {
      it('should return number of requests', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId })
        )
        const requestId1 = Effect.runSync(RequestId.generate())
        const { session: session2 } = Effect.runSync(
          Session.addRequest(session1, requestId1)
        )
        const requestId2 = Effect.runSync(RequestId.generate())
        const { session: session3 } = Effect.runSync(
          Session.addRequest(session2, requestId2)
        )

        //When & Then
        expect(Session.getRequestCount(session3)).toBe(2)
      })

      it('should return 0 for new session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))

        //When & Then
        expect(Session.getRequestCount(session)).toBe(0)
      })
    })

    describe('hasRequest', () => {
      it('should return true when requestId exists', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId })
        )
        const requestId = Effect.runSync(RequestId.generate())
        const { session: session2 } = Effect.runSync(
          Session.addRequest(session1, requestId)
        )

        //When & Then
        expect(Session.hasRequest(session2, requestId)).toBe(true)
      })

      it('should return false when requestId does not exist', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))
        const requestId = Effect.runSync(RequestId.generate())

        //When & Then
        expect(Session.hasRequest(session, requestId)).toBe(false)
      })
    })

    describe('getDuration', () => {
      it('should return duration for Closed session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const establishedAt = 1000
        const closedAt = 5000
        const { session: session1 } = Effect.runSync(
          Session.establish({ sessionId, timestamp: establishedAt })
        )
        const { session: closedSession } = Effect.runSync(
          Session.close(session1, undefined, closedAt)
        )

        //When
        const duration = Session.getDuration(closedSession)

        //Then
        expect(duration).toBe(4000)
      })

      it('should return undefined for Active session', () => {
        //Given
        const sessionId = Effect.runSync(SessionId.generate())
        const { session } = Effect.runSync(Session.establish({ sessionId }))

        //When
        const duration = Session.getDuration(session)

        //Then
        expect(duration).toBeUndefined()
      })
    })
  })

  describe('Multiple Requests', () => {
    it('should track multiple requests correctly', () => {
      //Given
      const sessionId = Effect.runSync(SessionId.generate())
      let { session } = Effect.runSync(Session.establish({ sessionId }))

      const requestIds = [
        Effect.runSync(RequestId.generate()),
        Effect.runSync(RequestId.generate()),
        Effect.runSync(RequestId.generate()),
      ]

      //When
      for (const requestId of requestIds) {
        const result = Effect.runSync(Session.addRequest(session, requestId))
        session = result.session
      }

      //Then
      expect(Session.getRequestCount(session)).toBe(3)
      expect(Session.hasRequest(session, requestIds[0]!)).toBe(true)
      expect(Session.hasRequest(session, requestIds[1]!)).toBe(true)
      expect(Session.hasRequest(session, requestIds[2]!)).toBe(true)
    })
  })
})
