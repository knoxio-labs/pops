/**
 * `purchase_documents` — the seam to the `documents` pillar.
 *
 * The Amazon DSAR bundle alone ships 325 tax-invoice PDFs plus a delivery
 * photo manifest, and a tax invoice is the arbiter whenever the CSV's own
 * arithmetic is ambiguous. Without somewhere to put them the evidence is
 * discarded at ingest and the ambiguity becomes permanent.
 *
 * A table rather than a `documentUri` column because one order routinely
 * has several documents of different kinds, and a delivery has its own
 * (the photo proving it arrived).
 *
 * `documents` is a bridge pillar that owns no DB, so this holds a soft
 * `pops://documents/...` URI with a `staleAt` companion, resolved by a
 * nightly cron and never at read time — the same treatment every other
 * cross-pillar reference in this schema gets.
 */
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { DOCUMENT_KINDS } from '../../contract/constants.js';
import { purchases, purchaseShipments } from './purchases.js';

export const purchaseDocuments = sqliteTable(
  'purchase_documents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /** Set when the document belongs to one delivery (a proof-of-delivery photo) rather than the whole order. */
    shipmentId: text('shipment_id').references(() => purchaseShipments.id, {
      onDelete: 'set null',
    }),
    /** Soft cross-pillar URI: `pops://documents/document/<id>`. */
    documentUri: text('document_uri').notNull(),
    documentStaleAt: text('document_stale_at'),
    kind: text('kind', { enum: DOCUMENT_KINDS }).notNull().default('other'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_purchase_documents').on(t.purchaseId, t.documentUri),
    index('idx_purchase_documents_purchase').on(t.purchaseId),
    index('idx_purchase_documents_shipment').on(t.shipmentId),
    index('idx_purchase_documents_kind').on(t.kind),
  ]
);
