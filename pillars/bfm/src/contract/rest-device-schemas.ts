import { z } from 'zod';

/**
 * Wire schemas for the device-facing surface — the routes a phone reaches on
 * bfm's own hostname, where Cloudflare Access is bypassed (POPS-1389).
 *
 * Every string here arrives from the public internet, so each one is bounded.
 * An unbounded field on an unauthenticated route is a way to make this pillar
 * hold, validate and write whatever a stranger sends, and SQLite will happily
 * store a megabyte of it.
 */

/**
 * What the phone posts to pair.
 *
 * `publicKey` is only checked for *shape* here — that it is a bounded string.
 * Whether those bytes are a well-formed P-256 SPKI key is decided by
 * `parseDevicePublicKey` in the handler, and deliberately so: this schema
 * cannot express "parses as an EC key on prime256v1", and a regex that
 * approximated it would accept keys the verifier later rejects, which is the
 * worst of both.
 */
export const PairDeviceRequestSchema = z.object({
  /**
   * The pairing code as the operator read it out or the QR carried it.
   *
   * Accepted grouped (`XXXX-XXXX-XXXX`), ungrouped, and in either case —
   * `normalizePairingCode` folds all three to one canonical form. The bound is
   * well above the 14 characters a grouped code occupies so a stray space does
   * not read as a malformed request.
   */
  code: z.string().min(1).max(64),
  /**
   * Base64 (standard alphabet) of the SPKI/DER encoding of the P-256 public
   * key the app generated in the Secure Enclave.
   *
   * A P-256 SPKI key is 91 bytes, so 124 base64 characters. The cap is set
   * well above that rather than at it: the exact length is the parser's
   * business, and a byte-tight bound here would turn a future encoding detail
   * into a schema rejection that reads as a malformed request.
   */
  publicKey: z.string().min(1).max(512),
  /** Operator-facing label, e.g. `Joao's iPhone`. Trimmed — leading space is not a name. */
  deviceName: z.string().trim().min(1).max(64),
  /** Hardware identifier as the handset reports it, e.g. `iPhone17,1`. */
  deviceModel: z.string().trim().min(1).max(64),
});

export type PairDeviceRequest = z.infer<typeof PairDeviceRequestSchema>;

/**
 * What a successful pairing hands back — the phone's whole identity, returned
 * exactly once.
 *
 * `refreshToken` is the only copy: only its digest is persisted, so a response
 * the handset fails to store means pairing again with a fresh code.
 *
 * There is no refresh-token expiry field. The handset cannot act on it —
 * rotation re-ups the window on every refresh, and the recovery when the
 * window has lapsed is the same as for any other refusal (pair again). A field
 * the client would only ever log is a field that can drift from the row.
 */
export const PairedDeviceSchema = z.object({
  deviceId: z.uuid(),
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds the access token stays valid, counted from this response. */
  expiresIn: z.number().int().positive(),
});

export type PairedDevice = z.infer<typeof PairedDeviceSchema>;

/**
 * Why a pairing attempt was refused — two codes, on two statuses, and the
 * split between them is the security property this route turns on.
 *
 * - **`invalid_request` (400)** — the request itself is wrong: a body that
 *   does not match the schema, or a `publicKey` that is not a P-256 SPKI key.
 *   This is the app's own bug and retrying the same bytes cannot fix it.
 * - **`pairing_rejected` (403)** — the code did not buy a device. Unknown,
 *   expired and already-consumed all produce this, byte for byte identical,
 *   because a response that distinguished them would turn a code short enough
 *   to read off a screen into an oracle you could walk.
 *
 * The two are safe to distinguish only because the handler validates the key
 * **before** it touches the code. Were the order reversed, an attacker could
 * post a deliberately malformed key with a guessed code and read the status as
 * the answer: 403 for a wrong code, 400 for a right one. The uniform rejection
 * would be uniform and useless.
 *
 * 403 rather than 401: the code is a body parameter, not an HTTP
 * authentication credential, and RFC 9110 requires a 401 to carry a
 * `WWW-Authenticate` challenge this route has none to offer. §15.5.4's "the
 * server does not wish to reveal exactly why the request has been refused" is
 * this route's requirement stated in the spec's own words.
 *
 * They are TWO schemas rather than one with a two-member enum, the same call
 * `MobileAuthErrorSchema` makes next door and for the same reason: `code`
 * restates the status, so one schema on both would have the document promise a
 * `400 pairing_rejected` the handler cannot produce, and every generated client
 * would still have to branch on it. A literal per status removes the impossible
 * half from every consumer's type.
 *
 * Only the rejection is `Pairing`-named. "Your request does not match what this
 * server accepts" is not about pairing at all — `POST /devices/refresh`
 * answers exactly the same shape, and `rest/request-validation.ts` builds one
 * constant for both — so the 400 is the surface's, not this route's.
 */
export const DeviceInvalidRequestErrorSchema = z.object({
  code: z.literal('invalid_request'),
  message: z.string(),
});

export const PairingRejectedErrorSchema = z.object({
  code: z.literal('pairing_rejected'),
  message: z.string(),
});

/**
 * Either refusal, for a reader that handles both. No contract route references
 * this — a route knows which status it is describing.
 */
export const PairingErrorSchema = z.discriminatedUnion('code', [
  DeviceInvalidRequestErrorSchema,
  PairingRejectedErrorSchema,
]);

export type DeviceInvalidRequestError = z.infer<typeof DeviceInvalidRequestErrorSchema>;
export type PairingRejectedError = z.infer<typeof PairingRejectedErrorSchema>;
export type PairingError = z.infer<typeof PairingErrorSchema>;

/**
 * The server nonce a refresh is signed over.
 *
 * Opaque to the phone: echo it back in the refresh request, and let the app's
 * signing step fold it into the message. Nothing else is a valid thing to do
 * with it. Single-use and short-lived — `api/auth/refresh-challenge.ts` says
 * how short, and why it is not a database row.
 *
 * `expiresIn` is here so an app can decide whether a nonce it already holds is
 * still worth trying, rather than discovering it is not by spending a refresh
 * token against it. Seconds, matching {@link PairedDeviceSchema}'s field of the
 * same name.
 */
export const RefreshChallengeSchema = z.object({
  nonce: z.string(),
  expiresIn: z.number().int().positive(),
});

export type RefreshChallenge = z.infer<typeof RefreshChallengeSchema>;

/**
 * What the phone posts to refresh: the credential, the challenge it is bound
 * to, and the proof it still holds the Secure Enclave key.
 *
 * The exact bytes `signature` covers are defined once, in the header of
 * `api/auth/refresh-exchange.ts`. They are deliberately not restated here: two
 * descriptions of one byte string is how the Swift side and this one end up
 * signing different things, and the failure is a 401 that looks like anything
 * else.
 *
 * Bounded like every other field on this surface — see the file header. The
 * caps sit well above the real widths (a 256-bit token is 43 base64url
 * characters; a P-256 DER signature is at most 72 bytes, so 96 base64) rather
 * than at them, so an encoding detail cannot become a rejection that reads as
 * a malformed request.
 */
export const RefreshSessionRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512),
  nonce: z.string().min(1).max(256),
  /** Base64 of the ASN.1 DER ECDSA P-256 signature. */
  signature: z.string().min(1).max(512),
});

export type RefreshSessionRequest = z.infer<typeof RefreshSessionRequestSchema>;

/**
 * What a successful refresh hands back.
 *
 * The new refresh token is the only copy, exactly as at pairing — and the
 * presented one is already dead by the time this is written, so a response the
 * handset fails to store means pairing again.
 *
 * No `deviceId`. The phone already holds one from pairing, and returning a
 * second copy would invite an app to trust this response over its own
 * keychain. Pairing returns it because that is where the phone learns it;
 * repeating it here would only create a value with two sources.
 */
export const RefreshedSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds the access token stays valid, counted from this response. */
  expiresIn: z.number().int().positive(),
});

export type RefreshedSession = z.infer<typeof RefreshedSessionSchema>;

/**
 * Why a refresh was refused, on a 401 — two codes, two different recoveries.
 *
 * - **`challenge_expired`** — the nonce was unknown, already spent, or past its
 *   life. Nothing is wrong with the credential: fetch another challenge and
 *   retry, once.
 * - **`invalid_grant`** — the refresh token or the signature did not hold.
 *   Unknown, expired, revoked, already spent, and signed by the wrong key all
 *   produce this, byte for byte identical, for the same reason
 *   {@link PairingRejectedErrorSchema} collapses its three: a response that
 *   told them apart would answer "does this token exist" for whoever asked.
 *   The recovery is to pair again.
 *
 * An enum here rather than a literal per schema, which is the opposite of the
 * call made for pairing above — and follows the same rule. There, `code`
 * restated the status, so one schema on two statuses would have described
 * responses the handler could not produce. Here both codes live on the SAME
 * status and neither restates it: 401 alone does not say which recovery to
 * run, which is exactly why the field is worth carrying.
 *
 * A 403 on this route carries `DeviceRevokedErrorSchema` from
 * `rest-schemas.ts` instead — the same shape the `/mobile` perimeter answers
 * with, because it means the same thing and selects the same recovery: pair
 * again AND wipe the keychain.
 */
export const RefreshErrorSchema = z.object({
  code: z.enum(['challenge_expired', 'invalid_grant']),
  message: z.string(),
});

export type RefreshError = z.infer<typeof RefreshErrorSchema>;
