/**
 * The bearer token a paired phone puts on every `/mobile/*` request: minting
 * one, and verifying one.
 *
 * Symmetric on purpose. bfm is both the only issuer and the only verifier, so
 * an asymmetric key would buy a public half nobody reads and cost a larger
 * signature on every cellular request.
 *
 * That single-party property also settles clock skew: the `iat` and `exp`
 * this module writes are read back by the same process against the same
 * clock, so the phone's clock never enters verification and no
 * `clockTolerance` is warranted. A tolerance here would only widen the
 * expiry window for an attacker.
 */
import jwt from 'jsonwebtoken';

import type { KeyObject } from 'node:crypto';

/**
 * Pinned at both ends. Verification passes this as the sole entry of
 * `algorithms`, which is what makes `alg: none` and an RS256-signed token
 * fail before any signature check runs — accepting whatever the header claims
 * is the classic JWT confusion bug.
 */
export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;

/**
 * Minutes, not hours. The token is the only credential on the wire and there
 * is no revocation list to check it against between mints, so its lifetime IS
 * the window in which a leaked token is useful. Ten minutes trades one refresh
 * round-trip every ten minutes for that window.
 *
 * Deliberately a constant rather than an environment variable. The value is a
 * security property of the design, and a knob on it is a knob that can be
 * turned to `86400` by a deploy nobody reviews.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 600;

/**
 * The JWT `typ` header, pinning what kind of token this is so a signature
 * check can never be mistaken for a purpose check.
 *
 * The header rather than a payload claim, for two reasons. `typ` is a
 * spec-defined header parameter (RFC 7519 §5.1) and a payload claim of the
 * same name would shadow it for every reader and every tool; and RFC 9068
 * puts exactly this on JWT access tokens, as `at+jwt`. The value here is
 * bfm-specific so a token minted by some other service could never be
 * mistaken for one of these even if it shared the key.
 *
 * Trusting the header is safe: it is part of the JWS signing input, so
 * altering it invalidates the signature. It is not an extension of trust to
 * `alg`, which is pinned separately and independently below.
 *
 * Nothing else is signed with this key today. It is here from the start
 * because adding it later is a flag day — every live token would have to keep
 * verifying without it, which is the same as not having it.
 */
export const ACCESS_TOKEN_TYPE = 'bfm-at+jwt' as const;

/**
 * The whole payload: the device id, an issued-at and an expiry. All three are
 * registered claims and there are no private ones, because this rides on every
 * request over cellular and anything a handler needs beyond the device id can
 * be read from the device row the guard already loads.
 */
export interface AccessTokenClaims {
  /** The `devices.id` this token speaks for. */
  sub: string;
  /** Seconds since the epoch. */
  iat: number;
  /** Seconds since the epoch. */
  exp: number;
}

export interface MintedAccessToken {
  token: string;
  /** What the client should count down to before refreshing. */
  expiresInSeconds: number;
}

/**
 * Any reason a token did not verify, collapsed to one type.
 *
 * The caller maps this to a single 401: "expired", "tampered" and "signed
 * with another key" all mean the same thing to the phone — get a new token,
 * and if that fails, pair again. Splitting them would invite recovery logic
 * built on a distinction the client cannot act on.
 *
 * Messages carry the reason but never the token, in whole or in part.
 */
export class AccessTokenError extends Error {
  override readonly name = 'AccessTokenError' as const;
}

/**
 * Mint a short-lived access token for `deviceId`.
 *
 * @param deviceId a `devices.id`. Rejected when blank: a token whose `sub`
 * matches no row is structurally valid and useless, and it would fail at the
 * guard rather than here, where the caller can still see what it did wrong.
 */
export function mintAccessToken(deviceId: string, signingKey: KeyObject): MintedAccessToken {
  if (deviceId.trim() === '') {
    throw new AccessTokenError('[bfm-api] refusing to mint an access token without a device id');
  }
  const token = jwt.sign({}, signingKey, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    subject: deviceId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    header: { alg: ACCESS_TOKEN_ALGORITHM, typ: ACCESS_TOKEN_TYPE },
  });
  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * `jwt.verify` treats `exp` as optional — a token carrying no `exp` at all
 * passes every check it makes and then never expires. Only a holder of the
 * signing key could produce one, so this is defence in depth rather than a
 * live hole, but the failure mode it guards against is a permanent
 * credential, which is worth four lines.
 */
function narrowClaims(payload: unknown): AccessTokenClaims {
  if (payload === null || typeof payload !== 'object') {
    throw new AccessTokenError('[bfm-api] access token payload is not an object');
  }
  const { sub, iat, exp } = payload as Record<string, unknown>;
  if (typeof sub !== 'string' || sub === '') {
    throw new AccessTokenError('[bfm-api] access token carries no device id');
  }
  if (typeof iat !== 'number' || typeof exp !== 'number') {
    throw new AccessTokenError('[bfm-api] access token carries no issued-at or expiry');
  }
  return { sub, iat, exp };
}

/**
 * Verify signature, algorithm, expiry and claim shape.
 *
 * @throws {AccessTokenError} for every failure, with a message safe to log.
 * The token itself is never interpolated into it.
 */
export function verifyAccessToken(token: string, signingKey: KeyObject): AccessTokenClaims {
  let verified: jwt.Jwt;
  try {
    verified = jwt.verify(token, signingKey, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      // `complete` so the signed header is available to check `typ` against.
      complete: true,
    });
  } catch (error) {
    throw new AccessTokenError(
      `[bfm-api] access token rejected: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (verified.header.typ !== ACCESS_TOKEN_TYPE) {
    throw new AccessTokenError('[bfm-api] token is not a bfm access token');
  }
  return narrowClaims(verified.payload);
}
