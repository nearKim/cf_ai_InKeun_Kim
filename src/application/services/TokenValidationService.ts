import { Effect, Data } from 'effect'

export type TokenPayload = {
  readonly userId: string
  readonly sessionId: string
  readonly homeServerUrl: string
  readonly expiresAt: number
}

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly reason: 'invalid_token' | 'expired_token' | 'missing_token' | 'invalid_home_server_url'
  readonly message: string
}> {}

export interface TokenValidationService {
  validate(token: string | null): Effect.Effect<TokenPayload, AuthenticationError>
}

export class BearerTokenValidationService implements TokenValidationService {
  constructor(
    private readonly secretKey: string,
    private readonly allowedHomeServerPattern: RegExp
  ) {}

  validate(token: string | null): Effect.Effect<TokenPayload, AuthenticationError> {
    return Effect.gen(this, function* () {
      if (!token || token.trim() === '') {
        return yield* Effect.fail(
          new AuthenticationError({
            reason: 'missing_token',
            message: 'Authorization header is required',
          })
        )
      }

      const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token

      let payload: Partial<TokenPayload>
      try {
        const decoded = atob(rawToken)
        payload = JSON.parse(decoded) as Partial<TokenPayload>
      } catch {
        return yield* Effect.fail(
          new AuthenticationError({
            reason: 'invalid_token',
            message: 'Failed to decode token',
          })
        )
      }

      if (!payload.userId || !payload.sessionId || !payload.homeServerUrl || !payload.expiresAt) {
        return yield* Effect.fail(
          new AuthenticationError({
            reason: 'invalid_token',
            message: 'Token is missing required fields',
          })
        )
      }

      if (payload.expiresAt < Date.now()) {
        return yield* Effect.fail(
          new AuthenticationError({
            reason: 'expired_token',
            message: 'Token has expired',
          })
        )
      }

      if (!this.allowedHomeServerPattern.test(payload.homeServerUrl)) {
        return yield* Effect.fail(
          new AuthenticationError({
            reason: 'invalid_home_server_url',
            message: 'Home server URL does not match allowed pattern',
          })
        )
      }

      return {
        userId: payload.userId,
        sessionId: payload.sessionId,
        homeServerUrl: payload.homeServerUrl,
        expiresAt: payload.expiresAt,
      }
    })
  }
}

export const createTokenValidationService = (
  secretKey: string,
  allowedHomeServerPattern: string | RegExp = /^wss:\/\/.*\.nearkim\.dev$/
): TokenValidationService => {
  const pattern = typeof allowedHomeServerPattern === 'string'
    ? new RegExp(allowedHomeServerPattern)
    : allowedHomeServerPattern

  return new BearerTokenValidationService(secretKey, pattern)
}

export const createTestToken = (payload: TokenPayload): string => btoa(JSON.stringify(payload))
