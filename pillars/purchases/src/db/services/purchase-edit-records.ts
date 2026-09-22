/**
 * Writing `purchase_edits` rows for a planned update: header fields and the
 * kept lines' own field changes. Split from `purchase-edit.ts` to keep both
 * files under the line-count cap.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { purchaseEdits } from '../schema.js';
import { type PurchasesDb } from './internal.js';

import type { PurchaseEditField } from '../../contract/constants.js';
import type { PurchaseRow } from '../schema.js';
import type { UpdatePlan } from './purchase-edit-plan.js';
import type { UpdatePurchaseInput } from './purchase-input.js';

export interface EditRecord {
  readonly purchaseId: string;
  readonly field: PurchaseEditField;
  readonly itemId: string | null;
  readonly original: string | null;
  readonly editedAt: string;
}

/** Insert one `purchase_edits` row, unless one already holds this exact key — the first original wins. */
export function recordEditIfAbsent(db: PurchasesDb, record: EditRecord): void {
  const { purchaseId, field, itemId, original, editedAt } = record;
  const already =
    db
      .select({ id: purchaseEdits.id })
      .from(purchaseEdits)
      .where(
        and(
          eq(purchaseEdits.purchaseId, purchaseId),
          eq(purchaseEdits.field, field),
          itemId === null ? isNull(purchaseEdits.itemId) : eq(purchaseEdits.itemId, itemId)
        )
      )
      .limit(1)
      .get() !== undefined;
  if (already) return;
  db.insert(purchaseEdits).values({ purchaseId, field, itemId, original, editedAt }).run();
}

export function recordHeaderEdits(
  db: PurchasesDb,
  purchase: PurchaseRow,
  input: UpdatePurchaseInput,
  now: string
): void {
  const id = purchase.id;
  if (
    (input.merchantEntityId !== undefined &&
      input.merchantEntityId !== purchase.merchantEntityId) ||
    (input.merchantEntityName !== undefined &&
      input.merchantEntityName !== purchase.merchantEntityName)
  ) {
    recordEditIfAbsent(db, {
      purchaseId: id,
      field: 'merchant',
      itemId: null,
      original: purchase.merchantEntityName,
      editedAt: now,
    });
  }
  if (input.orderedAt !== undefined && input.orderedAt !== purchase.orderedAt) {
    recordEditIfAbsent(db, {
      purchaseId: id,
      field: 'orderedOn',
      itemId: null,
      original: purchase.orderedAt,
      editedAt: now,
    });
  }
  const numericFields: readonly [PurchaseEditField, number | undefined, number][] = [
    ['total', input.totalCents, purchase.totalCents],
    ['subtotal', input.subtotalCents, purchase.subtotalCents],
    ['tax', input.taxCents, purchase.taxCents],
    ['shipping', input.shippingCents, purchase.shippingCents],
    ['discount', input.discountCents, purchase.discountCents],
    ['surcharge', input.surchargeCents, purchase.surchargeCents],
  ];
  for (const [field, next, current] of numericFields) {
    if (next !== undefined && next !== current) {
      recordEditIfAbsent(db, {
        purchaseId: id,
        field,
        itemId: null,
        original: String(current),
        editedAt: now,
      });
    }
  }
}

export function recordLineEdits(
  db: PurchasesDb,
  purchaseId: string,
  plan: UpdatePlan,
  now: string
): void {
  for (const { existing, next } of plan.kept) {
    if (next.name !== existing.name) {
      recordEditIfAbsent(db, {
        purchaseId,
        field: 'lineName',
        itemId: existing.id,
        original: existing.name,
        editedAt: now,
      });
    }
    if (next.quantity !== existing.quantity) {
      recordEditIfAbsent(db, {
        purchaseId,
        field: 'lineQuantity',
        itemId: existing.id,
        original: String(existing.quantity),
        editedAt: now,
      });
    }
    if (next.lineTotalCents !== existing.lineTotalCents) {
      recordEditIfAbsent(db, {
        purchaseId,
        field: 'lineTotal',
        itemId: existing.id,
        original: String(existing.lineTotalCents),
        editedAt: now,
      });
    }
  }
}
