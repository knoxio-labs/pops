import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Documents-owned admission/receipt ledger; Paperless remains the owner of archive records. */
export const uploads = sqliteTable(
  'uploads',
  {
    operationId: text('operation_id').primaryKey(),
    owner: text('owner').notNull(),
    input: text('input').notNull(),
    state: text('state', {
      enum: [
        'awaiting_content',
        'admitted',
        'dispatching',
        'outcome_unknown',
        'accepted',
        'done',
        'duplicate',
        'failed',
      ],
    }).notNull(),
    claim: text('claim'),
    taskId: text('task_id'),
    documentId: integer('document_id'),
    reason: text('reason'),
    contentAvailable: integer('content_available', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (row) => [
    check(
      'uploads_known_state',
      sql`${row.state} IN ('awaiting_content', 'admitted', 'dispatching', 'outcome_unknown', 'accepted', 'done', 'duplicate', 'failed')`
    ),
    check('uploads_positive_document', sql`${row.documentId} IS NULL OR ${row.documentId} > 0`),
    check(
      'uploads_original_proof',
      sql`${row.state} NOT IN ('done', 'duplicate') OR (${row.taskId} IS NOT NULL AND ${row.documentId} IS NOT NULL)`
    ),
    check(
      'uploads_task_proof',
      sql`${row.state} NOT IN ('accepted', 'failed') OR ${row.taskId} IS NOT NULL`
    ),
  ]
);

/** Internal persisted row, including an upstream owner binding that is never exposed as credentials. */
export type UploadRow = typeof uploads.$inferSelect;

/** Bind a ledger to a separately retained dispatch history, never to a silently recreated directory. */
export const uploadStore = sqliteTable(
  'upload_store',
  {
    id: integer('id').primaryKey(),
    guardId: text('guard_id').notNull(),
  },
  (row) => [check('upload_store_singleton', sql`${row.id} = 1`)]
);
