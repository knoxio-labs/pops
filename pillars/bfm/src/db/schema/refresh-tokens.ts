/**
 * `refresh_tokens` — the long-lived half of a paired device's credentials,
 * stored as a rotating chain rather than a single standing secret.
 *
 * Four columns exist only to make **reuse detection** possible, and removing
 * any one of them quietly removes the mechanism:
 *
 * - `familyId` groups every token descended from one pairing, so a single
 *   compromise can be answered by killing the lineage rather than one token.
 * - `consumedAt` records that a token was spent in a legitimate rotation.
 * - `replacedBy` names its successor, making the chain walkable in both
 *   directions — which is what lets an incident say *when* the fork happened.
 * - `revokedAt` records that a token was **killed**, by device revocation or
 *   by reuse detection. Separate from `consumedAt` on purpose: collapsing the
 *   two would make "the client rotated normally" and "we found a thief"
 *   indistinguishable in exactly the forensic read that needs to tell them
 *   apart.
 *
 * The property those four protect: an honest client and an attacker cannot
 * both hold a live token. Presenting an already-consumed token means one of
 * them replayed, so the whole family dies and the phone re-pairs.
 *
 * Only the hash is persisted. Unlike the pairing code next door, that alone
 * is sufficient here: a refresh token is CSPRNG-generated at full width and
 * never read by a human, so there is no candidate set for someone holding
 * `bfm.db` to enumerate offline.
 */
import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { devices } from './devices.js';

import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    /** Hash of the bearer token, and the row's identity — see `pairing_codes.codeHash` for why the hash is the key. */
    tokenHash: text('token_hash').primaryKey(),
    /**
     * Cascades: a device row that is genuinely deleted (as opposed to
     * revoked, which is the normal path and leaves the row) must not leave
     * tokens pointing at nothing. Revocation never reaches this — it sets
     * `devices.revokedAt` and leaves both rows in place.
     */
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** Shared by every token descended from one pairing exchange. Revocation operates on this, not on single rows. */
    familyId: text('family_id').notNull(),
    expiresAt: text('expires_at').notNull(),
    /** Set when the token is spent in a legitimate rotation. */
    consumedAt: text('consumed_at'),
    /** Set when the token is killed — device revoked, or its family burned by reuse detection. */
    revokedAt: text('revoked_at'),
    /**
     * The token this one rotated into. Self-referential, so a family is a
     * linked list from the pairing exchange forward.
     *
     * The FK is NO ACTION rather than cascading, which makes retention
     * pruning safe in exactly one direction: deleting the oldest rows first
     * always works, while deleting a successor out from under its predecessor
     * is refused instead of silently severing the chain.
     */
    replacedBy: text('replaced_by').references((): AnySQLiteColumn => refreshTokens.tokenHash),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    // "Kill every live token for this device" — the device-revocation path.
    index('idx_refresh_tokens_device').on(t.deviceId),
    // "Kill this whole family" — the reuse-detection path.
    index('idx_refresh_tokens_family').on(t.familyId),
    // A token has at most one predecessor: two rows claiming the same
    // successor would be a forked chain, which is the exact state reuse
    // detection exists to make impossible. NULLs don't collide in SQLite, so
    // every un-rotated token is unaffected.
    unique('uq_refresh_tokens_replaced_by').on(t.replacedBy),
    // Same lexicographic-is-chronological reasoning as `pairing_codes`.
    check('ck_refresh_tokens_expiry_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
    // A token cannot succeed itself. Without this, a rotation bug that wrote
    // the presented hash back into its own `replacedBy` would produce a
    // one-element cycle that reads as a valid chain.
    check('ck_refresh_tokens_no_self_succession', sql`${t.replacedBy} IS NOT ${t.tokenHash}`),
  ]
);
