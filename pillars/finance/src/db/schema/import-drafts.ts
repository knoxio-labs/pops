import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  IMPORT_DRAFT_SOURCE_KINDS,
  IMPORT_DRAFT_STORED_STATES,
} from '../../contract/import-draft.js';
import { IMPORT_PROVIDERS } from '../../contract/import-source.js';
import { accounts } from './accounts.js';

/**
 * A pending import (POPS-3308, finance ADR-005): every import started and not
 * yet committed, whether a person started it from a file or a provider
 * started it by sending rows. The server copy is the only copy; there is no
 * expiry, and a row leaves this table by commit or by discard.
 *
 * `payload` is the wizard's state as JSON, stamped with the `shape_version`
 * it was written under. The counts and the span beside it are denormalised
 * from the payload on every write so a card can be listed without parsing
 * forty drafts.
 *
 * Ownership is a lease, not a lock: `owner_token` names the tab in it and
 * `owner_seen_at` the last heartbeat; a token silent past the stale window
 * is replaced without ceremony.
 */
export const importDrafts = sqliteTable(
  'import_drafts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind', { enum: IMPORT_DRAFT_SOURCE_KINDS }).notNull(),
    provider: text('provider', { enum: IMPORT_PROVIDERS }),
    /** The `BankDialectId` a file draft's rows were parsed with. */
    dialectId: text('dialect_id'),
    /** The uploaded file names, JSON array; what the card calls the draft. Null for a live draft. */
    sourceFileNames: text('source_file_names'),
    state: text('state', { enum: IMPORT_DRAFT_STORED_STATES }).notNull(),
    /** The wizard step it stopped on; null until a person has opened it. */
    step: integer('step'),
    shapeVersion: integer('shape_version').notNull(),
    payload: text('payload').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    unresolvedCount: integer('unresolved_count').notNull().default(0),
    dateFrom: text('date_from'),
    dateTo: text('date_to'),
    /** Live only: the balance the provider reported with the newest row. */
    balanceReportedCents: integer('balance_reported_cents'),
    /** The `import_sessions` row whose result the Process step can reuse; FK-less because sessions expire. */
    processSessionId: text('process_session_id'),
    ownerToken: text('owner_token'),
    ownerSeenAt: text('owner_seen_at'),
    savedAt: text('saved_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('idx_import_drafts_account_state').on(table.accountId, table.state),
    // One collecting draft per account: arrivals have exactly one place to go.
    uniqueIndex('idx_import_drafts_one_live_per_account')
      .on(table.accountId)
      .where(sql`${table.state} = 'live'`),
  ]
);
