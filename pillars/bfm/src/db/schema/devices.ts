/**
 * `devices` — every phone that has completed the pairing exchange, and is
 * therefore allowed to reach the federation through this pillar.
 *
 * This table is the allow-list. A request arriving at bfm with a valid token
 * is only as trustworthy as the row behind it, so two properties are
 * load-bearing:
 *
 * **Revocation is a soft delete.** `revokedAt` is set; the row stays. A
 * deleted row would take the audit trail with it, and the question asked
 * after a phone is stolen is "what did that device hold, and when did it
 * last speak" — which is unanswerable against an absent row.
 *
 * **The public half only.** `publicKeyDer` is the SPKI encoding of a P-256
 * key generated inside the phone's Secure Enclave. The private half is
 * non-extractable and never leaves the handset, which is precisely what makes
 * the proof-of-possession refresh meaningful: a database read yields nothing
 * that can sign anything.
 */
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const devices = sqliteTable(
  'devices',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Operator-facing label — what the phone calls itself, e.g. `Joao's iPhone`. */
    name: text('name').notNull(),
    /** Hardware identifier as the handset reports it, e.g. `iPhone17,1`. */
    model: text('model').notNull(),
    /**
     * Base64 (standard alphabet, NOT base64url) of the SPKI/DER P-256 public
     * key. Text rather than a blob because every other column in the fleet is
     * text and a base64 string survives a `sqlite3 .dump`, a litestream
     * restore and a JSON response legibly; the one decode hop lands in the
     * verifier, which needs a `Buffer` for `node:crypto` either way.
     *
     * Deliberately NOT unique. A handset that re-pairs after revocation may
     * present the same Secure Enclave key — the key survives app reinstalls —
     * and a unique index would turn "revoke and re-pair" into a permanent
     * lockout of that phone.
     */
    publicKeyDer: text('public_key_der').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    /**
     * Last contact from this device. Not nullable: a row can only exist
     * because a device completed the pairing exchange, which is itself
     * contact. `lastSeenAt === createdAt` already reads as "not heard from
     * since pairing", so a null would encode nothing a value does not.
     */
    lastSeenAt: text('last_seen_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    /** Null while the device is trusted. Set once, never cleared — re-trusting means pairing again. */
    revokedAt: text('revoked_at'),
    /**
     * What this handset is allowed to do, as a JSON array of capability names
     * (ADR-048). The grant, per device: a `/mobile` route declares the
     * capability it requires and `requireCapability` refuses a request whose
     * caller does not hold it.
     *
     * JSON in one column rather than a join table because a grant is read on
     * every authenticated request and written only at pairing, and because it
     * has no attributes of its own — a row per capability would buy a second
     * query per request to reassemble a set.
     *
     * Defaults to the EMPTY grant, which is the fail-closed direction: a row
     * that reached this table without anyone deciding what it may do may do
     * nothing. Pairing writes the default vocabulary explicitly, and the
     * migration that added this column backfilled the devices that predate it
     * with the same set.
     */
    capabilities: text('capabilities').notNull().default('[]'),
  },
  // No index on `id`: SQLite backs a non-INTEGER primary key with an implicit
  // unique index, so lookups by device id are already index-driven. Adding one
  // would duplicate that index on every write and buy nothing.
  // `idx_devices_revoked_at` serves the operator device list, which partitions
  // on exactly this column.
  (t) => [index('idx_devices_revoked_at').on(t.revokedAt)]
);
