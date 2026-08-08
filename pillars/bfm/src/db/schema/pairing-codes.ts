/**
 * `pairing_codes` — the one-time secret that turns an unpaired phone into a
 * `devices` row.
 *
 * The plaintext is never written here. It is returned exactly once, at
 * issuance, and only a digest of it lands in this table.
 *
 * **That is not the same as "a stolen `bfm.db` is harmless", and nothing in
 * this file should be read as claiming it.** A pairing code is short enough
 * for a human to read off a screen and type into a handset, which makes it
 * short enough to *enumerate*: someone holding this table can hash guesses
 * offline until one matches `codeHash`, with no rate limit to slow them and
 * no request to log. The refresh-token digests next door carry no such gap —
 * those values are CSPRNG-generated at full width, so there is no candidate
 * set to walk.
 *
 * Closing it belongs to the code path that mints the code, which does not
 * exist yet, and needs one of two things: enough entropy in the code that
 * offline enumeration is infeasible, or a **keyed** digest under a pepper
 * held outside the database — a mounted secret, not a column — so that this
 * table is inert without the key. Either way the invariant to hold to is
 * that `bfm.db` alone must not be enough to recover a live code.
 *
 * Of the properties above, the database enforces exactly one:
 *
 * **`consumedAt` — single use.** A column, not a guarantee. Setting it in the
 * same transaction that inserts the device is what stops a replay minting a
 * second one, and that atomicity lives in the pairing handler; nothing here
 * can impose it.
 *
 * **`expiresAt` — short-lived.** Minutes out, not hours, which is what bounds
 * the enumeration window above. The CHECK below *is* enforced: it rejects a
 * code that expires before it was created — the signature of TTL arithmetic
 * that went the wrong way, and the same slip in the other direction produces
 * a code that never expires at all.
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
