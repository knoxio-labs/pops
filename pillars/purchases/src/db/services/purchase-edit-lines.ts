/**
 * Writing a planned update's line changes: kept lines updated in place,
 * added lines inserted, removed lines deleted. Split from `purchase-edit.ts`
 * to keep both files under the line-count cap.
 */
import { eq } from 'drizzle-orm';

import { purchaseItems } from '../schema.js';
import { type PurchasesDb } from './internal.js';
import { recordEditIfAbsent } from './purchase-edit-records.js';

import type { UpdatePlan } from './purchase-edit-plan.js';

export function writeKeptLines(db: PurchasesDb, plan: UpdatePlan): void {
  for (const { existing, next } of plan.kept) {
    const changed =
      next.name !== existing.name ||
      next.quantity !== existing.quantity ||
      next.lineTotalCents !== existing.lineTotalCents;
    if (!changed) continue;
    db.update(purchaseItems)
      .set({
        name: next.name,
        quantity: next.quantity,
        lineTotalCents: next.lineTotalCents,
        unitPriceCents: Math.round(next.lineTotalCents / next.quantity),
      })
      .where(eq(purchaseItems.id, existing.id))
      .run();
  }
}

export function writeAddedLines(db: PurchasesDb, plan: UpdatePlan, now: string): void {
  for (const [index, line] of plan.added.entries()) {
    const rows = db
      .insert(purchaseItems)
      .values({
        purchaseId: plan.purchase.id,
        position: plan.existingItems.length + index,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: Math.round(line.lineTotalCents / line.quantity),
        lineTotalCents: line.lineTotalCents,
        createdAt: now,
      })
      .returning({ id: purchaseItems.id })
      .all();
    const newId = rows[0]?.id;
    if (newId === undefined)
      throw new Error('commitPurchaseUpdate: added line was not written back');
    recordEditIfAbsent(db, {
      purchaseId: plan.purchase.id,
      field: 'lineAdded',
      itemId: newId,
      original: null,
      editedAt: now,
    });
  }
}

export function writeRemovedLines(db: PurchasesDb, plan: UpdatePlan, now: string): void {
  for (const { item, inventoryItemIds } of plan.removed) {
    const description = JSON.stringify({
      name: item.name,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      inventoryItemUris: inventoryItemIds.map((id) => `pops://inventory/item/${id}`),
    });
    recordEditIfAbsent(db, {
      purchaseId: plan.purchase.id,
      field: 'lineRemoved',
      itemId: item.id,
      original: description,
      editedAt: now,
    });
    // Units cascade with the item; deleting it is what the "unlinks it"
    // half of the policy means on this side.
    db.delete(purchaseItems).where(eq(purchaseItems.id, item.id)).run();
  }
}
