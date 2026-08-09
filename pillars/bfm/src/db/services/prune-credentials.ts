/**
 * Retention for `pairing_codes` and `refresh_tokens` — the two tables in
 * `bfm.db` nothing else in this pillar ever deletes a row from.
 *
 * ## Why a retention window at all
 *
 * A consumed pairing code or a dead refresh token is a stored digest of a
 * credential that can no longer be redeemed. Keeping it forever means the
 * blast radius of a stolen `bfm.db` grows for as long as the pillar has run,
 * for no benefit past the point an incident could still usefully be
 * reconstructed from it.
 *
 * ## Why the two tables do not share one rule
 *
 * `pairing_codes` has no equivalent of reuse detection: `redeemPairingCode`
 * only ever inspects the one row a presented code hashes to, so a dead row
 * carries no security function the moment its `consumedAt` or `expiresAt`
 * has passed. It is pruned as soon as a short forensic window elapses.
 *
 * `refresh_tokens` is different, and this is the reason the ticket that
 * tracked this file sat unfixed for as long as it did.
 * `screenPresentedGrant` in `api/auth/refresh-exchange.ts` treats a
 * **consumed** row as evidence of theft: presenting a token that was already
 * spent burns the whole family, live successor included. Deleting a
 * consumed row erases that evidence — a replayed, long-superseded token
 * would then match no row at all and be rejected as unknown, indistinguishable
 * from garbage, and the family it belongs to would NOT be burned. Pruning a
 * consumed row the moment it dies would quietly turn reuse detection off for
 * every token it could otherwise have caught a replay of.
 *
 * {@link REFRESH_TOKEN_RETENTION_MS} is what keeps it on for as long as it
 * can matter, and it is pinned to {@link DEFAULT_REFRESH_TOKEN_TTL_MS} rather
 * than to an independent number for a specific reason: a dead row's
 * successor is created no later than the row's own death (rotation writes
 * both in the same instant; a family-wide revoke stamps every surviving row
 * at once), so the successor's own retirement — by rotation, revocation, or
 * simply running past its {@link DEFAULT_REFRESH_TOKEN_TTL_MS} unused — can
 * never be pruned-eligible *before* the row that names it. Keeping the two
 * windows equal is what makes that hold: a row can only be deleted once
 * everything downstream of it in the chain has itself gone quiet for a full
 * rotation lifetime, which means either the family kept rotating (and a
 * later generation is now the one reuse detection checks a replay against)
 * or the family's live tail expired on its own (and there is no live
 * credential left in it for a replay to threaten). Shortening the retention
 * window below the token TTL would break that argument: a consumed row could
 * then be deleted while its immediate, still-live successor is in active
 * use, and a replay of the deleted row would go undetected against a family
 * that is very much alive.
 *
 * That argument is a proof about two constants, not about the process that
 * wires them: it holds only as long as whatever `refreshTokenTtlMs` actually
 * gets minted stays `<=` {@link REFRESH_TOKEN_RETENTION_MS}, and nothing
 * before {@link assertRefreshTokenRetentionCoversTtl} existed checked that at
 * the one place — `api/server.ts` — that decides what production mints.
 * `refreshTokenTtlMs` is threaded as an optional override through
 * `BfmApiDeps`, `BfmRestHandlerDeps`, `DeviceHandlerDeps` and the two
 * exchange functions for tests to drive; production has never used that seam,
 * but nothing stopped a future deploy from wiring one in without moving this
 * file's constant to match. {@link assertRefreshTokenRetentionCoversTtl} is
 * what turns that lapse into a boot crash instead of a silently disabled
 * security control.
 */
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { pairingCodes, refreshTokens } from '../schema.js';
import { DEFAULT_REFRESH_TOKEN_TTL_MS } from './refresh-tokens.js';

import type { BfmDb } from '../open-bfm-db.js';

/**
 * A week past death. Pairing codes are operator-minted and rate-limited — a
 * handful a year — so there is no volume pressure; the window exists only to
 * give an operator a few business days to ask "did that code get used"
 * before the row is gone.
 */
export const PAIRING_CODE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Equal to {@link DEFAULT_REFRESH_TOKEN_TTL_MS} — see this file's header for
 * why retention shorter than the token's own lifetime would silently disable
 * reuse detection for an active family.
 */
export const REFRESH_TOKEN_RETENTION_MS = DEFAULT_REFRESH_TOKEN_TTL_MS;

export class RefreshTokenRetentionError extends Error {
  override readonly name = 'RefreshTokenRetentionError' as const;
}

/**
 * Boot-time guard for the invariant this file's header argues: retention
 * must never fall below whatever refresh-token TTL is actually being minted.
 *
 * Call this at the one place that decides what production mints —
 * `api/server.ts`, against the value it is about to hand `createBfmApiApp` as
 * `refreshTokenTtlMs` — not inside the exchange functions themselves, which
 * tests legitimately drive with TTLs of their own choosing that have nothing
 * to do with what a deployment would ever configure.
 *
 * Both arguments are checked for being positive and finite before the
 * comparison, not just compared directly: `NaN > x` and `x > NaN` are both
 * `false` in JS, so a future parse bug that hands this a `NaN` would
 * otherwise pass the `>` check silently — the exact failure mode this
 * function exists to rule out, just moved one step earlier.
 *
 * @throws {RefreshTokenRetentionError} if either argument is not a positive,
 * finite number, or if `ttlMs` exceeds `retentionMs`.
 */
export function assertRefreshTokenRetentionCoversTtl(
  ttlMs: number,
  retentionMs: number = REFRESH_TOKEN_RETENTION_MS
): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RefreshTokenRetentionError(
      `[bfm-api] refresh token TTL must be a positive, finite number of milliseconds; got ` +
        `${String(ttlMs)}`
    );
  }
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    throw new RefreshTokenRetentionError(
      `[bfm-api] refresh token retention must be a positive, finite number of milliseconds; ` +
        `got ${String(retentionMs)}`
    );
  }
  if (ttlMs > retentionMs) {
    throw new RefreshTokenRetentionError(
      `[bfm-api] refresh token retention (${String(retentionMs)}ms) must be >= the refresh ` +
        `token TTL (${String(ttlMs)}ms): a shorter retention window can prune a consumed row ` +
        `while its still-live successor is in active use, silently disabling reuse detection ` +
        `for it`
    );
  }
}

export interface PruneOptions {
  /** Overrides the table's default window. Tests use this; production does not. */
  retentionMs?: number;
  /** Injectable clock, for tests. */
  now?: () => Date;
}

/**
 * Delete pairing codes that died — consumed, or simply expired unused — more
 * than {@link PAIRING_CODE_RETENTION_MS} ago.
 *
 * One statement is safe here: `pairing_codes` is neither self-referential nor
 * referenced by any other table (the schema file states why a `devices` link
 * back to the code that produced it would itself be a liability), so there is
 * no delete ordering to respect, unlike {@link pruneDeadRefreshTokens}.
 *
 * @returns how many rows were deleted.
 */
export function prunePairingCodes(db: BfmDb, options: PruneOptions = {}): number {
  const retentionMs = options.retentionMs ?? PAIRING_CODE_RETENTION_MS;
  const now = options.now ?? ((): Date => new Date());
  const cutoff = new Date(now().getTime() - retentionMs).toISOString();

  return db
    .delete(pairingCodes)
    .where(
      or(
        and(isNotNull(pairingCodes.consumedAt), lte(pairingCodes.consumedAt, cutoff)),
        and(isNull(pairingCodes.consumedAt), lte(pairingCodes.expiresAt, cutoff))
      )
    )
    .run().changes;
}

/**
 * Delete refresh tokens that have been dead — revoked, consumed, or simply
 * expired unused — for at least {@link REFRESH_TOKEN_RETENTION_MS}.
 *
 * @returns how many rows were deleted.
 */
export function pruneDeadRefreshTokens(db: BfmDb, options: PruneOptions = {}): number {
  const retentionMs = options.retentionMs ?? REFRESH_TOKEN_RETENTION_MS;
  const at = options.now?.() ?? new Date();
  const cutoff = new Date(at.getTime() - retentionMs).toISOString();

  // A row's death instant is `revokedAt`, else `consumedAt`, else
  // `expiresAt` — computed in SQL rather than re-derived per row in JS. A
  // still-live row (unrevoked, unconsumed) has no death instant earlier than
  // its own, still-future `expiresAt`, so comparing that against `cutoff`
  // excludes it here without a separate liveness check.
  const deadAt = sql<string>`coalesce(${refreshTokens.revokedAt}, ${refreshTokens.consumedAt}, ${refreshTokens.expiresAt})`;

  // Oldest-`createdAt`-first: the table's self-FK (`replacedBy`) is `ON
  // DELETE NO ACTION` — see the column docstring in
  // `../schema/refresh-tokens.ts` — so a row can only be removed once nothing
  // still names it, which is exactly its predecessor. A predecessor's own
  // death is never later than its successor's: rotation stamps a
  // predecessor's `consumedAt` with the same instant as the successor's
  // `createdAt`, and a family-wide revoke stamps every surviving row with one
  // shared instant. Walking oldest-first and deleting whatever this query
  // already decided is eligible therefore never asks to delete a row before
  // the one naming it.
  const candidates = db
    .select({ tokenHash: refreshTokens.tokenHash })
    .from(refreshTokens)
    .where(lte(deadAt, cutoff))
    .orderBy(asc(refreshTokens.createdAt))
    .all();

  let deleted = 0;
  for (const row of candidates) {
    deleted += db
      .delete(refreshTokens)
      .where(eq(refreshTokens.tokenHash, row.tokenHash))
      .run().changes;
  }
  return deleted;
}
