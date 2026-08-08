/**
 * Minting the long-lived half of a paired device's credentials.
 *
 * Only the head of a family is minted here — the one token the pairing
 * exchange hands back. Rotation, reuse detection and the walk along
 * `replacedBy` are POPS-1375's, and they read the rows this writes.
 *
 * ## Why this token is nothing like the pairing code next door
 *
 * A pairing code is short because a human types it, which is what forces the
 * ~59-bit entropy argument and the five-minute life in `pairing-codes.ts`. A
 * refresh token is read by no one: it goes into the phone's keychain and comes
 * back on a wire. So it is drawn at full CSPRNG width, and the consequences
 * fall out of that:
 *
 * - **A plain SHA-256 is the right digest**, for the opposite reason to the
 *   pairing code's. There, no KDF was warranted because slowing an attacker
 *   down buys nothing against 59 bits in five minutes. Here, there is no
 *   candidate set at all — someone holding `bfm.db` has nothing to enumerate.
 * - **No collision retry.** `issuePairingCode` retries a unique violation
 *   because a 59-bit draw against a live table is a real, if remote,
 *   possibility. At {@link REFRESH_TOKEN_BYTES} bytes it is not, and a retry
 *   loop would be dead code hiding a genuine bug: a duplicate hash here means
 *   the CSPRNG repeated itself, which is not a condition to paper over.
 */
import { createHash, randomBytes } from 'node:crypto';

import { refreshTokens } from '../schema.js';

import type { BfmDb } from '../open-bfm-db.js';

/**
 * Width of the token, before encoding. 256 bits — the same order as the HMAC
 * securing the access token, so neither half of the credential pair is the
 * cheaper thing to attack.
 */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * How long a refresh token stays redeemable.
 *
 * Thirty days is not how long a phone keeps working: every refresh rotates and
 * the successor starts a fresh thirty. It is the drawer limit — how long a
 * handset can sit untouched before it has to be paired again from the Devices
 * page. It is also the ceiling on how long a token stolen from a phone that
 * then went quiet stays useful, which is why it is measured in weeks and not
 * in years.
 */
export const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Draw a fresh token.
 *
 * base64url, so it survives a header, a query string and a JSON body without
 * an encoding hop — none of which it takes today, but the value is opaque to
 * every holder and the one thing that must never happen to it is a silent
 * re-encoding between the phone's keychain and this table's digest.
 */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/** The stored form: SHA-256 of the token as sent, hex. See the header for why not a KDF. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface InsertRefreshTokenValues {
  /** Digest of the plaintext. The plaintext itself never reaches this layer's caller twice. */
  tokenHash: string;
  deviceId: string;
  /** Shared by every token descended from one pairing exchange. */
  familyId: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Write one refresh-token row.
 *
 * `createdAt` is required rather than left to the column default for the same
 * reason `issuePairingCode` writes its own: the table's CHECK compares it
 * against `expiresAt`, and a default filled by SQLite's clock against an
 * expiry computed from the caller's is an enforced inequality straddling two
 * clocks.
 *
 * Takes a {@link BfmDb}, which a transaction handle also satisfies, so the
 * pairing exchange composes this into the same transaction as its device
 * insert and its code redemption.
 */
export function insertRefreshToken(db: BfmDb, values: InsertRefreshTokenValues): void {
  db.insert(refreshTokens).values(values).run();
}
