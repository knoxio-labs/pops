import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { transactions } from './transactions.js';

/**
 * A file attached to a transaction (POPS-5827).
 *
 * Finance holds the link only. The bytes live in the purchases receipt store
 * and `document_uri` is the reference that store issued.
 */
export const transactionAttachments = sqliteTable(
  'transaction_attachments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * FK → `transactions.id`, `ON DELETE CASCADE`. A link whose transaction is
     * gone describes nothing, and restoring a transaction does not bring its
     * attachments back.
     */
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    documentUri: text('document_uri').notNull(),
    mediaType: text('media_type').notNull(),
    /** Order within the transaction, ascending. Not unique: callers own the numbering. */
    position: integer('position').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    /** Email of whoever attached it. Null when that caller carried no identity. */
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('idx_transaction_attachments_transaction_document').on(
      table.transactionId,
      table.documentUri
    ),
  ]
);
