import * as jose from 'jose'
import { Effect, Data } from 'effect'

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly reason:
    | 'invalid_token'
    | 'expired_token'
    | 'missing_token'
    | 'invalid_home_server_url'
    | 'session_mismatch'
  readonly message: string
}> {}

export type TokenPayload = {
  readonly userId: string
  readonly sessionId: string
  readonly homeServerUrl: string
  readonly expiresAt: number
}

export interface TokenValidator {
  validate(token: string | null): Effect.Effect<TokenPayload, AuthenticationError>
}

export const createTokenValidator = (
  secretKey: string,
  allowedHomeServerPattern: string | RegExp = /^wss:\/\/.*\.nearkim\.dev$/
): TokenValidator => {
  const pattern =
    typeof allowedHomeServerPattern === 'string'
      ? new RegExp(allowedHomeServerPattern)
      : allowedHomeServerPattern

  const secret = new TextEncoder().encode(secretKey)

  return {
    validate(token: string | null): Effect.Effect<TokenPayload, AuthenticationError> {
      return Effect.gen(function* () {
        if (!token || token.trim() === '') {
          return yield* Effect.fail(
            new AuthenticationError({
              reason: 'missing_token',
              message: 'Authorization token is required',
            })
          )
        }

        const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token

        const verifyResult = yield* Effect.tryPromise({
          try: () => jose.jwtVerify(rawToken, secret),
          catch: (error) => {
            if (error instanceof jose.errors.JWTExpired) {
              return new AuthenticationError({
                reason: 'expired_token',
                message: 'Token has expired',
              })
            }
            return new AuthenticationError({
              reason: 'invalid_token',
              message: 'Invalid or tampered token',
            })
          },
        })

        const payload = verifyResult.payload
        const { userId, sessionId, homeServerUrl, exp } = payload as {
          userId?: string
          sessionId?: string
          homeServerUrl?: string
          exp?: number
        }

        if (!userId || !sessionId || !homeServerUrl) {
          return yield* Effect.fail(
            new AuthenticationError({
              reason: 'invalid_token',
              message: 'Token is missing required fields',
            })
          )
        }

        if (!pattern.test(homeServerUrl)) {
          return yield* Effect.fail(
            new AuthenticationError({
              reason: 'invalid_home_server_url',
              message: 'Home server URL does not match allowed pattern',
            })
          )
        }

        return {
          userId,
          sessionId,
          homeServerUrl,
          expiresAt: (exp ?? 0) * 1000,
        }
      })
    },
  }
}

export const createTestToken = async (
  payload: Omit<TokenPayload, 'expiresAt'> & { expiresIn?: string },
  secretKey: string
): Promise<string> => {
  const secret = new TextEncoder().encode(secretKey)
  return await new jose.SignJWT({
    userId: payload.userId,
    sessionId: payload.sessionId,
    homeServerUrl: payload.homeServerUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(payload.expiresIn ?? '1h')
    .sign(secret)
}

export const createExpiredTestToken = async (
  payload: Omit<TokenPayload, 'expiresAt'>,
  secretKey: string
): Promise<string> => {
  const secret = new TextEncoder().encode(secretKey)
  return await new jose.SignJWT({
    userId: payload.userId,
    sessionId: payload.sessionId,
    homeServerUrl: payload.homeServerUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('-1s')
    .sign(secret)
}
