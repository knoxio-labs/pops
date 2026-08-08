/**
 * The long-lived half of a paired device's credentials: minting the head of a
 * family, rotating along it, and killing one when it forks.
 *
 * The pairing exchange writes the head. Everything after it is rotation, and
 * the two writes below are the whole of the state machine `refresh_tokens`'s
 * four bookkeeping columns exist to make expressible — see the table's own
 * header for what each is for. Which of them a presented token trips, and in
 * what order, is `api/auth/refresh-exchange.ts`; this layer answers only "did
 * the row move", never "should it have".
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

import { and, eq, isNull } from 'drizzle-orm';

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

/**
 * One refresh-token row, as the refresh exchange needs to read it.
 *
 * `replacedBy` is absent on purpose. The exchange decides on `consumedAt` —
 * "was this spent" — and the successor's identity adds nothing to that
 * decision. It is written for an incident to walk later, and a value selected
 * into a request path is a value that can leak into a response by accident.
 */
export interface RefreshTokenRecord {
  tokenHash: string;
  deviceId: string;
  familyId: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

/**
 * Look one up by digest. The plaintext never reaches this layer.
 *
 * Returns `undefined` for an unknown digest, which the caller must answer
 * exactly as it answers a known-but-dead one — see the exchange's header for
 * why those two are one response.
 */
export function findRefreshTokenByHash(
  db: BfmDb,
  tokenHash: string
): RefreshTokenRecord | undefined {
  return db
    .select({
      tokenHash: refreshTokens.tokenHash,
      deviceId: refreshTokens.deviceId,
      familyId: refreshTokens.familyId,
      expiresAt: refreshTokens.expiresAt,
      consumedAt: refreshTokens.consumedAt,
      revokedAt: refreshTokens.revokedAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .get();
}

/**
 * Kill every live token in one family — the answer to reuse detection, and the
 * only write in this pillar that acts on a lineage rather than a row.
 *
 * `revokedAt IS NULL` rather than an unconditional update, for the same reason
 * `revokeDevice` filters: a token already killed keeps the instant that killed
 * it. Consumed tokens ARE included — a consumed row is spent, not dead, and
 * leaving it alive would leave the fork's other branch redeemable, which is
 * precisely the state this call exists to end.
 *
 * @returns how many rows this killed. Zero is possible and is not an error: a
 * second presentation of the same stolen token finds the family already burned.
 */
export function revokeRefreshTokenFamily(db: BfmDb, familyId: string, revokedAt: string): number {
  return db
    .update(refreshTokens)
    .set({ revokedAt })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
    .run().changes;
}

/**
 * Thrown inside {@link rotateRefreshToken}'s transaction, and caught by it, to
 * roll the successor insert back when the predecessor turns out to have moved.
 *
 * A sentinel rather than a returned value because drizzle commits a
 * transaction callback that returns and rolls back only one that throws, and a
 * rotation that inserted a successor without consuming its predecessor would
 * leave two live tokens in one family — the exact state reuse detection exists
 * to make impossible.
 */
class RefreshTokenRotationLost extends Error {
  override readonly name = 'RefreshTokenRotationLost' as const;
}

export interface RotateRefreshTokenValues {
  /** Digest of the token being spent. */
  presentedHash: string;
  /** The row that replaces it. Its `familyId` is the presented token's. */
  successor: InsertRefreshTokenValues;
  consumedAt: string;
}

/**
 * `rotated` — the presented token is now spent and the successor is live.
 * `not-rotated` — the presented token was already consumed or revoked by the
 * time the update ran, and nothing was written.
 */
export type RotateRefreshTokenResult = { outcome: 'rotated' } | { outcome: 'not-rotated' };

/**
 * Spend one token and issue its successor, atomically.
 *
 * ## Why the successor is inserted first
 *
 * `replacedBy` is a foreign key onto this same table and `foreign_keys` is ON,
 * so the row it names has to exist before the update that names it. Inserting
 * first and rolling back on a lost race is the only ordering that satisfies
 * both that constraint and the atomicity requirement.
 *
 * ## Why the UPDATE is conditional rather than a read-then-write
 *
 * The `WHERE … consumed_at IS NULL AND revoked_at IS NULL` is what makes two
 * refreshes racing one token resolve to exactly one winner. A `SELECT` that
 * checked those columns and an `UPDATE` that trusted the answer would be two
 * statements with a window between them; SQLite's write lock happens to close
 * that window today, which is a property of the engine rather than of this
 * code, and it would stop being true the moment the read moved outside the
 * transaction. Charging the condition to the `UPDATE` makes the guarantee the
 * statement's own.
 *
 * The loser is `not-rotated`, NOT an error: it is the honest client and the
 * attacker racing, and the caller answers it exactly as it answers a replay.
 */
export function rotateRefreshToken(
  db: BfmDb,
  values: RotateRefreshTokenValues
): RotateRefreshTokenResult {
  try {
    db.transaction((tx) => {
      tx.insert(refreshTokens).values(values.successor).run();

      const consumed = tx
        .update(refreshTokens)
        .set({ consumedAt: values.consumedAt, replacedBy: values.successor.tokenHash })
        .where(
          and(
            eq(refreshTokens.tokenHash, values.presentedHash),
            isNull(refreshTokens.consumedAt),
            isNull(refreshTokens.revokedAt)
          )
        )
        .run();

      if (consumed.changes !== 1) throw new RefreshTokenRotationLost();
    });
  } catch (error) {
    if (error instanceof RefreshTokenRotationLost) return { outcome: 'not-rotated' };
    throw error;
  }
  return { outcome: 'rotated' };
}
