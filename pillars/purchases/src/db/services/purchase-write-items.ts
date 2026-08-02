/**
 * The line grain and below: a line, its tags, and its units.
 *
 * Split from `purchase-writes.ts` to keep both files under the per-file
 * size limit — the line is the only part of the order graph with children
 * of its own.
 */
import { purchaseItems, purchaseItemTags, purchaseItemUnits } from '../schema.js';
import { expectRow } from './internal.js';
import { shipmentIdFor, type IngestContext } from './purchase-write-context.js';

import type { CreateItemInput } from './purchase-input.js';

export function insertItem(ctx: IngestContext, input: CreateItemInput, position: number): void {
  const rows = ctx.tx
    .insert(purchaseItems)
    .values({
      purchaseId: ctx.purchase.id,
      shipmentId: shipmentIdFor(ctx, input.shipmentRef),
      position,
      name: input.name,
      sku: input.sku ?? null,
      url: input.url ?? null,
      imageUrl: input.imageUrl ?? null,
      quantity: input.quantity ?? 1,
      unitPriceCents: input.unitPriceCents,
      lineTotalCents: input.lineTotalCents,
      allocatedShippingCents: input.allocatedShippingCents ?? 0,
      allocatedAdjustmentCents: input.allocatedAdjustmentCents ?? 0,
      merchantCategory: input.merchantCategory ?? null,
      kind: input.kind ?? null,
      createdAt: ctx.now,
    })
    .returning()
    .all();
  const itemId = expectRow(rows, 'createPurchase.item').id;
  ctx.itemIds.set(input.ref ?? String(position), itemId);

  insertItemTags(ctx, itemId, input);
  insertItemUnits(ctx, itemId, input);
}

function insertItemTags(ctx: IngestContext, itemId: string, input: CreateItemInput): void {
  // A Set so a source that repeats a tag on one line doesn't trip the
  // (item_id, tag) primary key.
  for (const tag of new Set(input.tags ?? [])) {
    ctx.tx.insert(purchaseItemTags).values({ itemId, tag, createdAt: ctx.now }).run();
  }
}

function insertItemUnits(ctx: IngestContext, itemId: string, input: CreateItemInput): void {
  for (const unit of input.units ?? []) {
    ctx.tx
      .insert(purchaseItemUnits)
      .values({
        itemId,
        serialNumber: unit.serialNumber ?? null,
        inventoryItemUri: unit.inventoryItemUri ?? null,
        createdAt: ctx.now,
      })
      .run();
  }
}
