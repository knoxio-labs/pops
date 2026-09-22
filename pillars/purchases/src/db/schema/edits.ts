/**
 * `purchase_edits` — the original value of anything a saved purchase's
 * header or lines are edited to. `purchases.updated_at` alone cannot answer
 * "what did this used to say", and the approved edit policy keeps that
 * answer visible after the edit lands.
 *
 * One row per `(purchaseId, field, itemId)` the FIRST time it changes: a
 * second edit of the same field must not overwrite the row's `original`,
 * or a purchase edited twice would show the reviewer's own first correction
 * as though the merchant had printed it.
 */
import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { PURCHASE_EDIT_FIELDS } from '../../contract/constants.js';
import { purchases } from './purchases.js';

export const purchaseEdits = sqliteTable(
  'purchase_edits',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    field: text('field', { enum: PURCHASE_EDIT_FIELDS }).notNull(),
    /** Null for a header field; the line's id for a `line*` field. */
    itemId: text('item_id'),
    /** The value before this edit. Null for `lineAdded`, which has none. */
    original: text('original'),
    editedAt: text('edited_at').notNull(),
  },
  (t) => [
    unique('uq_purchase_edits_key').on(t.purchaseId, t.field, t.itemId),
    index('idx_purchase_edits_purchase').on(t.purchaseId),
  ]
);
