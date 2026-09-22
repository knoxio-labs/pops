/**
 * The edit summary a purchase's detail carries: `null` for a purchase
 * nobody has ever edited, otherwise the latest edit time and every changed
 * field with its original and current value.
 *
 * `current` is computed here, from today's rows, rather than stored — the
 * value a reader wants is "what does it say now", and storing it would mean
 * a SECOND write path keeping it in sync with every other write this pillar
 * makes. A removed line's `current` is null: `item_id` on a `lineRemoved`
 * row is not a foreign key (POPS-4254), so there is nothing left to read.
 */
import { asc, eq } from 'drizzle-orm';

import { purchaseEdits } from '../schema.js';
import { type PurchasesDb } from './internal.js';

import type { PurchaseEditField } from '../../contract/constants.js';
import type { PurchaseItemRow, PurchaseRow } from '../schema.js';

export interface PurchaseFieldChange {
  readonly field: PurchaseEditField;
  readonly itemId: string | null;
  readonly original: string | null;
  readonly current: string | null;
}

export interface PurchaseEditSummary {
  readonly editedAt: string;
  readonly changes: readonly PurchaseFieldChange[];
}

const HEADER_FIELD_VALUE: Readonly<Record<string, (purchase: PurchaseRow) => string | null>> = {
  merchant: (p) => p.merchantEntityName,
  orderedOn: (p) => p.orderedAt,
  total: (p) => String(p.totalCents),
  subtotal: (p) => String(p.subtotalCents),
  tax: (p) => String(p.taxCents),
  shipping: (p) => String(p.shippingCents),
  discount: (p) => String(p.discountCents),
  surcharge: (p) => String(p.surchargeCents),
};

const LINE_FIELD_VALUE: Readonly<Record<string, (item: PurchaseItemRow) => string | null>> = {
  lineName: (item) => item.name,
  lineQuantity: (item) => String(item.quantity),
  lineTotal: (item) => String(item.lineTotalCents),
  lineAdded: (item) => item.name,
};

function currentValueOf(
  field: PurchaseEditField,
  itemId: string | null,
  purchase: PurchaseRow,
  itemsById: ReadonlyMap<string, PurchaseItemRow>
): string | null {
  const headerReader = HEADER_FIELD_VALUE[field];
  if (headerReader !== undefined) return headerReader(purchase);

  const lineReader = LINE_FIELD_VALUE[field];
  if (lineReader === undefined || itemId === null) return null;
  const item = itemsById.get(itemId);
  return item === undefined ? null : lineReader(item);
}

/** The edit summary for one purchase, or `null` if it has never been edited. */
export function getPurchaseEditSummary(
  db: PurchasesDb,
  purchase: PurchaseRow,
  items: readonly PurchaseItemRow[]
): PurchaseEditSummary | null {
  const rows = db
    .select()
    .from(purchaseEdits)
    .where(eq(purchaseEdits.purchaseId, purchase.id))
    .orderBy(asc(purchaseEdits.editedAt))
    .all();
  if (rows.length === 0) return null;

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const changes = rows.map((row) => ({
    field: row.field,
    itemId: row.itemId,
    original: row.original,
    current: currentValueOf(row.field, row.itemId, purchase, itemsById),
  }));
  const editedAt = rows.reduce(
    (latest, row) => (row.editedAt > latest ? row.editedAt : latest),
    ''
  );
  return { editedAt, changes };
}
