import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { CHECKPOINT_SOURCES } from '../../contract/checkpoint.js';
import { accounts } from './accounts.js';

/**
 * A balance that was true for an account on a date, read off something outside
 * the ledger — the banking app, a statement, a count of the wallet (POPS-2750,
 * ADR-051).
 *
 * This table is what makes a balance a balance rather than net flow. ADR-050
 * held that "an account's balance is always the sum of the transactions it
 * carries"; that is only true of an account whose history is complete from
 * inception, which none of ours are. A balance is the nearest checkpoint plus
 * the transactions since it, and the earliest checkpoint IS the opening
 * balance — which is why there is no opening-balance column here or on
 * `accounts`.
 *
 * Rows are append-only. There is no update primitive on purpose: a checkpoint
 * is a fact about a moment, and a corrected count is a new fact, not an edit
 * to the old one. Only `manual` rows may be deleted, and only because a typo
 * needs a way out.
 */
export const accountCheckpoints = sqliteTable(
  'account_checkpoints',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * FK → `accounts.id`, `ON DELETE CASCADE` — unlike every other finance
     * table, which uses `no action`. The only hard delete of an account is the
     * merge path (`services/merge-accounts.ts`), and POPS-2883 repoints these
     * rows onto the surviving account before it deletes. The cascade is the
     * backstop for a delete that arrives some other way: a checkpoint for an
     * account that no longer exists is not a record worth keeping, and an
     * orphan row would make `latestCheckpointAtOrBefore` answer for a ghost.
     */
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /**
     * LEDGER-SIGNED, exactly like `transactions.amountCents`: positive is money
     * held, negative is money owed, for assets and liabilities alike. A card
     * that owes $2,137.55 stores `-213755`. Callers translate from "amount
     * owed" at the edge; the row never does.
     */
    balanceCents: integer('balance_cents').notNull(),
    /**
     * ISO `YYYY-MM-DD`. The balance is the END-OF-DAY figure: every transaction
     * dated `<= as_of` is already inside it. `transactions.date` carries no
     * time and no posting date, so a finer boundary would be a fiction.
     */
    asOf: text('as_of').notNull(),
    source: text('source', { enum: CHECKPOINT_SOURCES }).notNull(),
    /**
     * The import commit key (POPS-2882) or statement document id (POPS-2752)
     * this row came from. Always null for a `manual` row.
     */
    sourceRef: text('source_ref'),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // Every read is "this account's checkpoints, ordered by date" — the
    // history list, and both directions of the anchor lookup.
    index('idx_account_checkpoints_account_as_of').on(table.accountId, table.asOf),
    // PARTIAL unique index, excluding `manual`: re-importing the same
    // statement must not double a checkpoint, while a second hand count on
    // the same day is a new fact and stays legal (newest `created_at` wins).
    uniqueIndex('idx_account_checkpoints_machine_source')
      .on(table.accountId, table.asOf, table.source)
      .where(sql`${table.source} != 'manual'`),
  ]
);
