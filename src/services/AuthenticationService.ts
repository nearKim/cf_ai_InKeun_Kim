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
}

export const createAuthenticationService = (
  secretKey: string,
  allowedHomeServerPattern: string | RegExp = /^wss:\/\/.*\.nearkim\.dev$/
): AuthenticationService => {
  const validator: TokenValidator = createTokenValidator(secretKey, allowedHomeServerPattern)

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
  }
}
