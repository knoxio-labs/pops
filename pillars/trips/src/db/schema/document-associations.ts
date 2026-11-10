import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { DOCUMENT_TARGET_KINDS } from '../../contract/document-associations.js';
import { trips } from './records.js';

/** Trips-owned references to Documents originals without transferring their ownership. */
export const tripDocumentAssociations = sqliteTable(
  'trip_document_associations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    documentId: integer('document_id').notNull(),
    targetKind: text('target_kind', { enum: DOCUMENT_TARGET_KINDS }).notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_trip_document_associations_trip').on(table.tripId),
    uniqueIndex('uq_trip_document_association').on(
      table.tripId,
      table.documentId,
      table.targetKind,
      table.targetId
    ),
  ]
);
