import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { IMPORT_SOURCE_KINDS } from '../../contract/import-source.js';
import { accountCheckpoints } from './account-checkpoints.js';
import { accounts } from './accounts.js';

/**
 * One row per account per committed import (POPS-2916, ADR-052): what was
 * read, from where, how many rows landed and the dates they span.
 *
 * Before this table the only provenance an import left was
 * `import_commits.commit_key`, which names a click, not an account, and the
 * only "when was this account last fed" answer was a ledger-wide
 * `MAX(last_edited_time)`. A commit can span several accounts once a row is
 * retargeted in review, so the grain is (account, commit), not commit.
 *
 * Rows are append-only. A batch is what happened, and re-running the same
 * commit key is a replay of the recorded result rather than a second batch:
 * the commit's own pre-flight returns before this table is reached. There is
 * deliberately no unique index on (account, commit_key) — a commit that
 * spanned two accounts later merged into one legitimately leaves the survivor
 * two batches under one key. `row_count` may be zero: an API sync that found
 * nothing new is still a fact about the account having been checked.
 *
 * There is deliberately NO backfill from `import_commits`. Nothing links a
 * pre-existing transaction to the commit that wrote it, so a batch minted from
 * that table would have to invent an account and a span; the honest answer for
 * history imported before this table is "no batch", and readers fall back to
 * the transactions themselves.
 */
export const importBatches = sqliteTable(
  'import_batches',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** FK → `accounts.id`, cascading like `account_checkpoints` and for the same reason: the merge path repoints first, the cascade is the backstop. */
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind', { enum: IMPORT_SOURCE_KINDS }).notNull(),
    /** The `BankDialectId`, parser id or provider the source named; null when the client declared none. */
    sourceRef: text('source_ref'),
    /** Parser grammar version, so a reparse can tell what produced a batch. */
    parserVersion: text('parser_version'),
    /**
     * `import_commits.commit_key` of the click that wrote this batch. Not a
     * foreign key: the commit row is recorded LAST in the commit transaction,
     * after every batch, so a constraint here would fire on every commit.
     */
    commitKey: text('commit_key'),
    rowCount: integer('row_count').notNull(),
    /** Inclusive `YYYY-MM-DD` span of the rows in this batch; both null when `row_count` is zero. */
    dateFrom: text('date_from'),
    dateTo: text('date_to'),
    /** The `import`-sourced checkpoint this batch minted (POPS-2882), when the source carried a balance. */
    checkpointId: text('checkpoint_id').references(() => accountCheckpoints.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // Every read is "this account's batches, newest first".
    index('idx_import_batches_account_created').on(table.accountId, table.createdAt),
    // "Which batches did this click write" — the statement epic's join back
    // from a commit (POPS-2752).
    index('idx_import_batches_commit_key').on(table.commitKey),
  ]
);
