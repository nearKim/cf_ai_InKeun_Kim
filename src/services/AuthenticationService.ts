import * as jose from 'jose'
import { Effect } from 'effect'
import {
  createTokenValidator,
  AuthenticationError,
  type TokenPayload,
  type TokenValidator,
} from '../validation'

export interface AuthenticationService {
  readonly validateToken: (
    token: string | null
  ) => Effect.Effect<TokenPayload, AuthenticationError>
  readonly validateSessionAccess: (
    token: string | null,
    expectedSessionId: string
  ) => Effect.Effect<TokenPayload, AuthenticationError>
  readonly generateBackendToken: () => Effect.Effect<string, AuthenticationError>
}

export const createAuthenticationService = (
  secretKey: string,
  allowedHomeServerPattern: string | RegExp = /^wss:\/\/.*\.nearkim\.dev$/
): AuthenticationService => {
  const validator: TokenValidator = createTokenValidator(secretKey, allowedHomeServerPattern)
  const secret = new TextEncoder().encode(secretKey)

  return {
    validateToken: (token) => validator.validate(token),

    validateSessionAccess: (token, expectedSessionId) =>
      Effect.gen(function* () {
        const payload = yield* validator.validate(token)

        if (payload.sessionId !== expectedSessionId) {
          return yield* Effect.fail(
            new AuthenticationError({
              reason: 'session_mismatch',
              message: 'Token session ID does not match requested session',
            })
          )
        }

        return payload
      }),

    generateBackendToken: () =>
      Effect.tryPromise({
        try: () =>
          new jose.SignJWT({ sub: 'cf-edge' })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('5m')
            .sign(secret),
        catch: () =>
          new AuthenticationError({
            reason: 'invalid_token',
            message: 'Failed to generate backend token',
          }),
      }),
  }
}
