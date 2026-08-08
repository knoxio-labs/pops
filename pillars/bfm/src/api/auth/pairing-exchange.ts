/**
 * The one moment a phone earns a long-lived identity. Everything after it is
 * token mechanics; this is the trust anchor.
 *
 * It spends a pairing code and, in exchange, writes a `devices` row and the
 * head of a refresh-token family, then hands back that pair plus a short-lived
 * access token. It lives here rather than in `db/services/` because it is the
 * one operation that spans persistence and credential minting, and the
 * atomicity requirement below is what forces those into a single place. The
 * alternative — a db service taking a `mintAccessToken` callback — would be
 * the same coupling with an indirection over it.
 *
 * ## Ordering, and why it is the security design rather than style
 *
 * **1. Parse the public key. Before anything touches the code.**
 *
 * The exchange has two failure classes and they answer with different statuses
 * — 400 for a request that is wrong, 403 for a code that did not work. That is
 * only safe in this order. Reversed, an attacker posts a deliberately
 * malformed key alongside a guessed code and reads the status as the answer:
 * 403 means the code was wrong, 400 means it was *right* and the request got
 * as far as the key. The uniform rejection the ticket asks for would be
 * uniform and useless. Validating first makes the 400 unconditional on the
 * code, so it carries no information about it.
 *
 * It also satisfies "do not store bytes you have not parsed" more strongly
 * than a check inside the transaction would: the parse happens before a
 * transaction is open at all.
 *
 * **2. Draw every value and mint the token. Still before the transaction.**
 *
 * The device id, the refresh token and the access token are all generated
 * ahead of the first write, which leaves the transaction containing writes and
 * nothing else. So the only way to fail once it is open is a database error,
 * and a database error rolls back — there is no path that burns a code and
 * then throws on the way to returning a token. Minting inside the transaction
 * would be the intuitive reading of "in one transaction" and is strictly
 * weaker: it puts a fallible non-database step where a rollback is the only
 * thing that could save it.
 *
 * The id has to be drawn here rather than read back from the insert for that
 * to work — the access token's `sub` is the device id, so a server-generated
 * id would put the mint after the write it must be atomic with.
 *
 * **3. Redeem, insert, insert. One transaction.**
 *
 * `redeemPairingCode` is a single conditional `UPDATE`, so two requests racing
 * one code cannot both see it unconsumed. Wrapping it with the two inserts is
 * what makes the other direction true as well: a crash between spending the
 * code and creating the device cannot leave a burned code with no device
 * behind it.
 */
import { randomUUID } from 'node:crypto';

import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  insertDevice,
  insertRefreshToken,
  redeemPairingCode,
} from '../../db/index.js';
import { mintAccessToken } from './access-token.js';
import { DevicePublicKeyError, parseDevicePublicKey } from './device-signature.js';

import type { KeyObject } from 'node:crypto';

import type { BfmDb } from '../../db/index.js';

export interface PairingExchangeInput {
  /** As presented — grouped or not, any case. `normalizePairingCode` folds it. */
  code: string;
  /** Base64 SPKI/DER of the handset's Secure Enclave P-256 public key. */
  publicKey: string;
  deviceName: string;
  deviceModel: string;
}

export interface PairingExchangeDeps {
  db: BfmDb;
  /** Signs the access token this exchange returns. */
  accessTokenSigningKey: KeyObject;
  /** Injectable clock, for tests. */
  now?: () => Date;
  /** Injectable, for tests. Defaults to {@link randomUUID}. */
  generateDeviceId?: () => string;
  /** Injectable, for tests — including for provoking a mid-transaction failure. */
  generateRefreshToken?: () => string;
  /** Lifetime of the minted refresh token. Defaults to {@link DEFAULT_REFRESH_TOKEN_TTL_MS}. */
  refreshTokenTtlMs?: number;
}

/**
 * Three outcomes, and the two failures are deliberately not one type.
 *
 * `invalid-key` is the caller's own bug and says so. `rejected` is every way a
 * code can fail to buy a device — unknown, expired, already consumed —
 * collapsed on purpose, because a caller able to tell them apart could walk
 * the code space with a single guess per response.
 */
export type PairingExchangeResult =
  | {
      outcome: 'paired';
      deviceId: string;
      accessToken: string;
      refreshToken: string;
      expiresInSeconds: number;
    }
  | { outcome: 'invalid-key' }
  | { outcome: 'rejected' };

export function completePairingExchange(
  input: PairingExchangeInput,
  deps: PairingExchangeDeps
): PairingExchangeResult {
  const {
    db,
    accessTokenSigningKey,
    now = () => new Date(),
    generateDeviceId = randomUUID,
    generateRefreshToken: drawRefreshToken = generateRefreshToken,
    refreshTokenTtlMs = DEFAULT_REFRESH_TOKEN_TTL_MS,
  } = deps;

  // Re-encoded from the parsed key rather than stored as presented. "Do not
  // store bytes you have not parsed" taken literally: what lands in the column
  // is what `createPublicKey` read back out, in the standard-alphabet base64
  // the column documents, whatever alphabet or padding the phone happened to
  // send. A handset that pairs with base64url and a handset that pairs with
  // standard base64 produce the same row, so the stored value is comparable.
  let publicKeyDer: string;
  try {
    publicKeyDer = parseDevicePublicKey(input.publicKey)
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
  } catch (error) {
    if (error instanceof DevicePublicKeyError) return { outcome: 'invalid-key' };
    throw error;
  }

  // Everything the transaction will write, computed before it opens. The digest
  // and the expiry arithmetic are here rather than inline below for the same
  // reason the mint is: the body of the transaction should be writes and
  // nothing else, so that "the only way to fail in there is a database error"
  // is a property you can check by reading it.
  const at = now();
  const createdAt = at.toISOString();
  const deviceId = generateDeviceId();
  // The family starts here. Every token that ever rotates out of the one below
  // carries this id, which is what device revocation and reuse detection
  // (POPS-1375) operate on rather than on single rows.
  const familyId = randomUUID();
  const refreshToken = drawRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const refreshTokenExpiresAt = new Date(at.getTime() + refreshTokenTtlMs).toISOString();
  const access = mintAccessToken(deviceId, accessTokenSigningKey);

  return db.transaction((tx): PairingExchangeResult => {
    if (!redeemPairingCode(tx, input.code, at)) return { outcome: 'rejected' };

    insertDevice(tx, {
      id: deviceId,
      name: input.deviceName,
      model: input.deviceModel,
      publicKeyDer,
      createdAt,
    });

    insertRefreshToken(tx, {
      tokenHash: refreshTokenHash,
      deviceId,
      familyId,
      expiresAt: refreshTokenExpiresAt,
      createdAt,
    });

    return {
      outcome: 'paired',
      deviceId,
      accessToken: access.token,
      refreshToken,
      expiresInSeconds: access.expiresInSeconds,
    };
  });
}
