import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { items } from './items.js';

/** The states an ingestion row can hold; a finished one becomes an `item_documents` row. */
export const DOCUMENT_INGESTION_STATES = ['pending', 'failed'] as const;
export type DocumentIngestionState = (typeof DOCUMENT_INGESTION_STATES)[number];

/**
 * A file uploaded to Paperless for an item whose consumption task has not
 * finished (`pending`) or did not produce a document (`failed`, kept with
 * its reason until dismissed).
 */
export const itemDocumentIngestions = sqliteTable(
  'item_document_ingestions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    documentType: text('document_type').notNull(),
    title: text('title'),
    fileName: text('file_name').notNull(),
    state: text('state', { enum: DOCUMENT_INGESTION_STATES }).notNull().default('pending'),
    reason: text('reason'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    unique('uq_item_document_ingestions_task').on(table.taskId),
    index('idx_item_document_ingestions_item').on(table.itemId),
    index('idx_item_document_ingestions_state').on(table.state),
    check('ck_item_document_ingestions_state', sql`${table.state} IN ('pending', 'failed')`),
  ]
);
