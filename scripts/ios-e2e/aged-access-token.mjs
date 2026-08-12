/**
 * A bfm access token that was minted long enough ago to have expired.
 *
 * The harness owns `BFM_ACCESS_TOKEN_SECRET`, so it can produce a token the
 * running pillar accepts as its own and rejects as too old — which is the whole
 * trick behind the session-expiry flow. What reaches `requireDevice` is a real
 * HS256 token with a real past `exp`, so the 401 the app recovers from is
 * produced by the pillar's own `verifyAccessToken`, not by anything pretending
 * on its behalf.
 *
 * ## Why not just shorten the TTL
 *
 * `pillars/bfm/src/api/auth/access-token.ts` states the case against a knob on
 * `ACCESS_TOKEN_TTL_SECONDS`: the lifetime is a security property, and a knob
 * on it is one a deploy can turn the wrong way. There is a second reason this
 * file exists that is about the test rather than the pillar — a short TTL makes
 * the expiry land at whatever moment the simulator happens to reach, so the
 * flow would pass or fail on how fast the runner drew a screen. Ageing exactly
 * one request makes the rejection a fact the flow states rather than a race it
 * hopes to win.
 *
 * Signed here with `node:crypto` rather than `jsonwebtoken`: this file runs
 * from the repo root, where the BFM's own dependencies are not resolvable, and
 * an HS256 JWS is a base64url header, a base64url payload and an HMAC over the
 * two.
 */
import { createHmac } from 'node:crypto';

/** Both pinned by `pillars/bfm/src/api/auth/access-token.ts`, which verifies against them. */
const ALGORITHM = 'HS256';
const TOKEN_TYPE = 'bfm-at+jwt';

/**
 * The gap this pretends the token was minted with.
 *
 * Cosmetic, and deliberately so: `exp` alone decides the rejection, and `iat`
 * is only read after that check passes. It is stated so the artefact is shaped
 * like something bfm would have issued rather than like something assembled to
 * fail — but nothing here breaks if the pillar's real TTL changes, which is why
 * it is not read from over there.
 */
const PRETENDED_LIFETIME_SECONDS = 600;

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * The device a token speaks for, WITHOUT verifying it.
 *
 * Verification is the pillar's job and duplicating it here would be a second
 * opinion to keep in step. All this needs is the subject, so the replacement
 * names the same device the real token did — a substitute carrying somebody
 * else's id would still be refused, but for the wrong reason, and the flow
 * would be proving something other than expiry.
 *
 * @param {string} token
 * @returns {string | null} the `sub` claim, or null when there is not one to read
 */
export function deviceIdFrom(token) {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const sub = claims?.sub;
  return typeof sub === 'string' && sub !== '' ? sub : null;
}

/**
 * Mint a token for `deviceId` that expired `expiredForSeconds` ago.
 *
 * @param {{ deviceId: string, secret: string, now?: Date, expiredForSeconds?: number }} options
 * @returns {string} a compact JWS
 */
export function mintAgedAccessToken({
  deviceId,
  secret,
  now = new Date(),
  expiredForSeconds = 60,
}) {
  if (deviceId === '') {
    throw new Error('aged-access-token: refusing to mint a token with no device id');
  }
  // A non-positive age mints something still valid, which would sail through
  // the guard and leave the flow asserting a refresh that never had to happen.
  if (!(expiredForSeconds > 0)) {
    throw new Error(
      `aged-access-token: expiredForSeconds must be positive; got ${String(expiredForSeconds)}`
    );
  }

  const expiresAt = Math.floor(now.getTime() / 1000) - expiredForSeconds;
  const signingInput = [
    encodeSegment({ alg: ALGORITHM, typ: TOKEN_TYPE }),
    encodeSegment({
      sub: deviceId,
      iat: expiresAt - PRETENDED_LIFETIME_SECONDS,
      exp: expiresAt,
    }),
  ].join('.');

  const signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}
