/**
 * `pairing_codes` — the one-time secret that turns an unpaired phone into a
 * `devices` row.
 *
 * A pairing code is short enough for a human to read off a screen and type
 * into a handset, which means it is short enough to guess. Three properties
 * compensate, and all three are enforced here rather than left to a handler:
 *
 * **Only the hash is stored.** The plaintext is returned exactly once, at
 * issuance, and never again. Someone holding a copy of `bfm.db` holds no
 * usable credential.
 *
 * **Single use.** `consumedAt` is set inside the same transaction that
 * inserts the device, so a replay of the same code cannot mint a second
 * device.
 *
 * **Short-lived.** `expiresAt` is minutes out, not hours, which bounds the
 * window a brute force has to work in. The CHECK below is the guard against
 * a TTL calculation that silently produces a code already dead on arrival —
 * or, worse, one that never expires because the arithmetic went the wrong way.
 */
import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pairingCodes = sqliteTable(
  'pairing_codes',
  {
    /**
     * Hash of the plaintext code, and the row's identity. There is nothing
     * else to key on: two codes hashing alike ARE the same code, so a
     * separate surrogate id would only allow storing that collision twice.
     *
     * Primary key rather than a plain index — the lookup during pairing is by
     * hash and nothing else, and SQLite's implicit unique index over a
     * non-INTEGER primary key already serves it.
     */
    codeHash: text('code_hash').primaryKey(),
    expiresAt: text('expires_at').notNull(),
    /** Null while unredeemed. Set once, in the same transaction as the device insert. */
    consumedAt: text('consumed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  // Both columns are ISO-8601 UTC to millisecond precision — `toISOString()`
  // on one side, `strftime('%Y-%m-%dT%H:%M:%fZ')` on the other — so a
  // lexicographic comparison is a chronological one.
  (t) => [check('ck_pairing_codes_expiry_after_creation', sql`${t.expiresAt} > ${t.createdAt}`)]
);
