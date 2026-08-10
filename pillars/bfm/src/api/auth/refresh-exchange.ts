/**
 * Refresh: proof of possession, rotation, and the fork detector.
 *
 * A refresh token is a long-lived bearer credential, and on its own a leaked
 * one is a permanent compromise. Two mechanisms answer that, and both live
 * here.
 *
 * **Proof of possession.** The request is signed by the key in the handset's
 * Secure Enclave, which never leaves it. A stolen token without the phone
 * verifies against nothing.
 *
 * **Rotation with reuse detection.** Every success spends the presented token
 * and issues its successor in the same family. Presenting a token that was
 * already spent means two parties hold what should be one credential — a
 * replay or a theft, and there is no third reading — so the family dies and
 * the phone pairs again. It is never silently reissued.
 *
 * ## THE SIGNED MESSAGE
 *
 * The phone signs these bytes, and this is the only prose description of them
 * anywhere. `clients/ios` reproduces the construction in Swift, and no compiler
 * sees both halves:
 *
 * ```
 * BFM-REFRESH-V1\n<nonce>\n<sha256(refreshToken), lowercase hex>
 * ```
 *
 * UTF-8, exactly two `\n` separators, **no trailing newline**. ECDSA P-256 over
 * SHA-256, signature in ASN.1 DER, base64 on the wire —
 * `auth/device-signature.ts` owns those encodings and says why.
 *
 * Every part of that line earns its place:
 *
 * - **`BFM-REFRESH-V1`** is domain separation. The Enclave key signs for one
 *   purpose today; the moment it signs for a second, a signature harvested
 *   from one context must not be replayable in the other. A prefix costs
 *   nothing now and cannot be added later without a flag day. The `V1` is
 *   there so a future format change is a new value rather than an
 *   indistinguishable one.
 * - **the nonce** binds the signature to one exchange. Without it a signature
 *   captured once authorises every refresh after it, and possession of the
 *   phone stops being required.
 * - **the token's digest, not the token** binds the signature to the specific
 *   credential — so a signature is not transferable to a different token in
 *   the same family — while keeping the secret out of the preimage. Anything
 *   that ever logs or traces the signing input therefore cannot leak the
 *   token. It is also the value this server already computed to find the row,
 *   so there is one derivation rather than two that could disagree.
 *
 * Getting any of this wrong on either side produces a signature that does not
 * verify, which reaches the app as a `401` indistinguishable from an expired
 * token. That failure mode is the reason the format is stated here rather than
 * inferred from the code below, and the reason it is not left as prose: a
 * committed vector at `contracts/refresh-message-v1.json` carries one nonce,
 * one token, its digest and the resulting bytes, and both languages assert
 * against it. This pillar generates it — see
 * `scripts/generate-refresh-message-fixture.ts` — and `clients/ios` vendors a
 * byte-identical copy, so a change on either side reddens a build rather than
 * reaching a handset.
 *
 * ## The order of the checks IS the design
 *
 * Reuse detection runs **before** signature verification. That looks backwards
 * — an unauthenticated caller triggering a family revocation reads like a
 * denial of service — and it is deliberate. Reaching that check at all
 * requires presenting a token that this server issued, and a refresh token is
 * 256 CSPRNG bits, so it cannot be reached by guessing: possession of one is
 * itself the evidence. Verifying the signature first would mean a thief who
 * stole the token but not the phone never trips the detector, and the family
 * they stole from stays alive — which is the compromise this whole mechanism
 * exists to end.
 *
 * The nonce is spent **before** anything else, including on failure. A nonce
 * that survived a failed attempt would be a nonce an attacker could keep
 * trying signatures against.
 *
 * The device's revocation is checked **before** the token's, because those two
 * select different recoveries on the phone: `403` says an operator cut this
 * handset off and refreshing will never help, `401` says this grant is dead.
 * Both end in pairing again, and only one of them means "wipe the keychain".
 */
import {
  findDeviceById,
  findRefreshTokenByHash,
  generateRefreshToken,
  hashRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
} from '../../db/index.js';
import { mintAccessToken } from './access-token.js';
import {
  DevicePublicKeyError,
  parseDevicePublicKey,
  verifyDeviceSignature,
} from './device-signature.js';

import type { KeyObject } from 'node:crypto';

import type { BfmDb, DeviceRow, RefreshTokenRecord } from '../../db/index.js';
import type { RefreshChallengeStore } from './refresh-challenge.js';

/**
 * Prefix of the signed message. See this file's header — it is the domain
 * separator, and changing it invalidates every handset in the field.
 */
export const REFRESH_SIGNATURE_DOMAIN = 'BFM-REFRESH-V1' as const;

/**
 * Build the exact bytes the phone signed.
 *
 * Exported because it is half of a cross-language contract, and because it is
 * what produces the pin: `scripts/generate-refresh-message-fixture.ts` writes
 * this function's output to `contracts/refresh-message-v1.json`,
 * `__tests__/refresh-message-fixture.test.ts` asserts the two still agree, and
 * `clients/ios` builds the same string from Swift against a vendored copy of
 * the same bytes.
 *
 * @param nonce As issued by {@link RefreshChallengeStore}, verbatim.
 * @param refreshTokenHash Lowercase hex, as {@link hashRefreshToken} returns.
 */
export function refreshSignatureMessage(nonce: string, refreshTokenHash: string): Buffer {
  return Buffer.from(`${REFRESH_SIGNATURE_DOMAIN}\n${nonce}\n${refreshTokenHash}`, 'utf8');
}

export interface RefreshExchangeInput {
  /** The token as the phone stored it. Only its digest is persisted here. */
  refreshToken: string;
  /** The nonce from `POST /devices/challenge`, unmodified. */
  nonce: string;
  /** Base64 of the ASN.1 DER ECDSA signature over {@link refreshSignatureMessage}. */
  signature: string;
}

export interface RefreshExchangeDeps {
  db: BfmDb;
  /** Signs the access token this exchange returns. */
  accessTokenSigningKey: KeyObject;
  /** Where the nonce issued a moment ago is spent. */
  challenges: RefreshChallengeStore;
  /** Injectable clock, for tests. */
  now?: () => Date;
  /** Injectable, for tests. Defaults to {@link generateRefreshToken}. */
  generateRefreshToken?: () => string;
  /**
   * Injectable, for tests, and for one specific reason.
   *
   * `rotateRefreshToken` can report `not-rotated` — the row was live when this
   * function read it and spent by the time the `UPDATE` ran. In one process
   * that cannot happen: better-sqlite3 is synchronous, so nothing runs between
   * the read and the write. The branch below is therefore correct, load-bearing
   * the day a second writer exists, and unreachable from any test that does not
   * substitute this. Leaving it untested on a security path is the worse of the
   * two options.
   */
  rotate?: typeof rotateRefreshToken;
  /** Lifetime of the successor token. Defaults to {@link DEFAULT_REFRESH_TOKEN_TTL_MS}. */
  refreshTokenTtlMs?: number;
}

/**
 * Four outcomes, mapped to three statuses by the handler.
 *
 * `rejected` deliberately covers an unknown token, an expired one, a revoked
 * one, a detected reuse and a bad signature alike. Telling them apart would
 * answer "does this token exist" for whoever asked, and the phone's recovery
 * is the same for all five: pair again.
 *
 * `challenge-expired` is split out because its recovery is genuinely
 * different — fetch another nonce and retry once — and because nonce validity
 * is not a secret: the caller chose the value it sent.
 */
export type RefreshExchangeResult =
  | {
      outcome: 'refreshed';
      deviceId: string;
      accessToken: string;
      refreshToken: string;
      expiresInSeconds: number;
    }
  | { outcome: 'challenge-expired' }
  | { outcome: 'device-revoked' }
  | { outcome: 'rejected' };

/**
 * Kill the family and say so, once.
 *
 * Logged because it is the one event on this route an operator would want to
 * see: it means a credential this server issued is held by someone who should
 * not have it. It is not a flooding primitive — reaching it needs a real
 * token, and every later presentation of that token finds the family already
 * revoked and takes the silent path. Neither the token nor the signature is
 * logged; the ids are identifiers, not credentials.
 */
function burnFamily(db: BfmDb, token: RefreshTokenRecord, at: string): void {
  const killed = revokeRefreshTokenFamily(db, token.familyId, at);
  // "not already revoked", not "live". `revokeRefreshTokenFamily` kills every
  // row in the family whose `revokedAt` was null — spent ones included, which
  // is the point of burning a lineage rather than a token. Calling that count
  // "live" would overstate it to whoever is reading this during an incident.
  console.warn(
    `[bfm-api] refresh-token reuse detected for device ${token.deviceId} — revoked family ${token.familyId} (${killed} token(s) that were not already revoked, spent ones included). This device must pair again.`
  );
}

/**
 * Does the caller hold the phone?
 *
 * Both ways of answering no collapse to `false`, because the exchange has one
 * response for them and an operator has one question. They are told apart in
 * the log, not on the wire.
 *
 * An unreadable stored key means this pillar's own data is wrong: pairing
 * parses and re-encodes before it writes the column, so only a restore or a
 * hand-edited file can produce one. It was tempting to let that throw and
 * surface as a 500 — loud, and honest about whose fault it is. It is the wrong
 * call, because of who each option strands. A 500 leaves the handset looping
 * forever on a condition it cannot fix, on a status the contract does not
 * declare. Answering `rejected` sends it to pair again, and pairing WRITES A
 * FRESH PARSED KEY — so the recovery genuinely repairs the row rather than
 * papering over it. The `console.error` is what keeps the operator informed,
 * which is the only thing the 500 was really buying.
 */
function provesPossession(
  device: DeviceRow,
  nonce: string,
  presentedHash: string,
  signatureBase64: string
): boolean {
  let publicKey: KeyObject;
  try {
    publicKey = parseDevicePublicKey(device.publicKeyDer);
  } catch (error) {
    if (!(error instanceof DevicePublicKeyError)) throw error;
    console.error(
      `[bfm-api] device ${device.id} has a stored public key that no longer parses — refusing its refresh. Re-pair this device; the row is repaired by pairing. (${error.message})`
    );
    return false;
  }
  return verifyDeviceSignature(
    publicKey,
    refreshSignatureMessage(nonce, presentedHash),
    Buffer.from(signatureBase64, 'base64')
  );
}

/**
 * Everything decided about the presented token before the signature is looked
 * at — the half of the order this file's header argues for.
 *
 * Separated from the exchange below because it is the part with the branches,
 * and because the split falls on the honest seam: this answers "is this grant
 * still redeemable at all", and what follows answers "and does the caller hold
 * the phone". Reuse detection lives on THIS side of that line, which is the
 * whole point.
 */
type ScreenedGrant =
  | { verdict: 'live'; token: RefreshTokenRecord; device: DeviceRow }
  | { verdict: 'refused'; outcome: 'rejected' | 'device-revoked' };

function screenPresentedGrant(db: BfmDb, presentedHash: string, atIso: string): ScreenedGrant {
  const token = findRefreshTokenByHash(db, presentedHash);
  if (token === undefined) return { verdict: 'refused', outcome: 'rejected' };

  const device = findDeviceById(db, token.deviceId);
  // A token whose device row is gone. The FK cascades, so this needs a delete
  // that revocation never performs — a restored backup, or a hand-edited
  // database. `rejected` rather than `device-revoked`: nothing was revoked,
  // and telling the phone it was would send it to a screen explaining an event
  // that did not happen.
  if (device === undefined) return { verdict: 'refused', outcome: 'rejected' };
  if (device.revokedAt !== null) return { verdict: 'refused', outcome: 'device-revoked' };

  if (token.revokedAt !== null) return { verdict: 'refused', outcome: 'rejected' };

  // The fork. See the header for why this precedes the signature check.
  if (token.consumedAt !== null) {
    burnFamily(db, token, atIso);
    return { verdict: 'refused', outcome: 'rejected' };
  }

  // String comparison, not `Date` parsing: every timestamp in this database is
  // written by `toISOString`, so it is fixed-width UTC and lexicographic order
  // is chronological order — the same property the table's CHECK constraints
  // are built on.
  if (token.expiresAt <= atIso) return { verdict: 'refused', outcome: 'rejected' };

  return { verdict: 'live', token, device };
}

export function completeRefreshExchange(
  input: RefreshExchangeInput,
  deps: RefreshExchangeDeps
): RefreshExchangeResult {
  const {
    db,
    accessTokenSigningKey,
    challenges,
    now = () => new Date(),
    generateRefreshToken: drawRefreshToken = generateRefreshToken,
    rotate = rotateRefreshToken,
    refreshTokenTtlMs = DEFAULT_REFRESH_TOKEN_TTL_MS,
  } = deps;

  if (!challenges.consume(input.nonce)) return { outcome: 'challenge-expired' };

  const at = now();
  const atIso = at.toISOString();
  const presentedHash = hashRefreshToken(input.refreshToken);

  const screened = screenPresentedGrant(db, presentedHash, atIso);
  if (screened.verdict === 'refused') return { outcome: screened.outcome };
  const { token: presented, device } = screened;

  if (!provesPossession(device, input.nonce, presentedHash, input.signature)) {
    return { outcome: 'rejected' };
  }

  const successorToken = drawRefreshToken();
  const rotation = rotate(db, {
    presentedHash,
    consumedAt: atIso,
    successor: {
      tokenHash: hashRefreshToken(successorToken),
      deviceId: presented.deviceId,
      familyId: presented.familyId,
      expiresAt: new Date(at.getTime() + refreshTokenTtlMs).toISOString(),
      createdAt: atIso,
    },
  });

  // The same fork as above, detected a moment later: the row was live when it
  // was read and spent by the time the update ran, so two requests presented
  // one token. Answering it identically is the point — the honest client's own
  // double-submit and a thief racing it are indistinguishable here, and the
  // one that is safe to assume is theft. The phone's single-flight logic is
  // what keeps an honest handset out of this branch.
  if (rotation.outcome === 'not-rotated') {
    burnFamily(db, presented, atIso);
    return { outcome: 'rejected' };
  }

  const access = mintAccessToken(presented.deviceId, accessTokenSigningKey);
  return {
    outcome: 'refreshed',
    deviceId: presented.deviceId,
    accessToken: access.token,
    refreshToken: successorToken,
    expiresInSeconds: access.expiresInSeconds,
  };
}
