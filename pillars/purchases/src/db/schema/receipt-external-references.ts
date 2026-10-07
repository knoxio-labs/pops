/**
 * `receipt_external_references` — a stored receipt pinned by another pillar.
 *
 * `purchase_documents` can only say a purchase holds a receipt, because its
 * `purchase_id` is NOT NULL. A file that is evidence for something outside
 * this pillar (a finance transaction's attachment) has no purchase to hang
 * off, so without a row here the retention sweep would delete it after 48
 * hours like any abandoned upload.
 *
 * No foreign key in either direction: `document_uri` names a file in the
 * content-addressed store rather than a row, and `owner_uri` names a row on
 * another pillar's database.
 */
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const receiptExternalReferences = sqliteTable(
  'receipt_external_references',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** `pops://purchases/receipt/<sha256>`, the same URI `purchase_documents` stores. */
    documentUri: text('document_uri').notNull(),
    /** Soft cross-pillar URI of whatever holds the file as evidence. */
    ownerUri: text('owner_uri').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    unique('uq_receipt_external_references').on(t.documentUri, t.ownerUri),
    index('idx_receipt_external_references_owner').on(t.ownerUri),
  ]
);
