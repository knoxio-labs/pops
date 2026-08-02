/**
 * The line grain and below: a line, its tags, and its units.
 *
 * Split from `purchase-writes.ts` to keep both files under the per-file
 * size limit — the line is the only part of the order graph with children
 * of its own.
 */
import { InvalidIngestPayloadError } from '../errors.js';
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
  registerItemRef(ctx, input.ref, position, itemId);

  insertItemTags(ctx, itemId, input);
  insertItemUnits(ctx, itemId, input);
}

/**
 * Record the adapter-local handle a charge allocation will reference.
 *
 * A line with no `ref` is addressable by its index, which is convenient for
 * a simple adapter — but it means an explicit ref of `'0'` and the implicit
 * key for the line at position 0 are the same string. Silently overwriting
 * would attach a charge's money to the wrong line, and nothing downstream
 * could detect it: both lines exist, both amounts are plausible, and the
 * order still balances.
 *
 * So a collision is rejected rather than resolved. An adapter that wants
 * numeric refs must declare them on every line.
 */
function registerItemRef(
  ctx: IngestContext,
  ref: string | undefined,
  position: number,
  itemId: string
): void {
  const key = ref ?? String(position);
  if (ctx.itemIds.has(key)) {
    throw new InvalidIngestPayloadError(
      ref === undefined
        ? `item at position ${String(position)} has no ref and its positional key '${key}' is already taken by an explicit ref`
        : `duplicate item ref '${key}'`
    );
  }
  ctx.itemIds.set(key, itemId);
}

function insertItemTags(ctx: IngestContext, itemId: string, input: CreateItemInput): void {
  // A Set so a source that repeats a tag on one line doesn't trip the
  // (item_id, tag) primary key.
  for (const tag of new Set(input.tags ?? [])) {
    ctx.tx.insert(purchaseItemTags).values({ itemId, tag, createdAt: ctx.now }).run();
  }
}

function insertItemUnits(ctx: IngestContext, itemId: string, input: CreateItemInput): void {
  const units = input.units ?? [];
  // A unit is one physical thing, so a line of quantity 2 cannot have three
  // of them. Fewer is fine and normal — units are created lazily, only where
  // one needs identity (a serial number, an inventory fan-out).
  if (units.length > (input.quantity ?? 1)) {
    throw new InvalidIngestPayloadError(
      `line '${input.name}' has ${String(units.length)} units but a quantity of ${String(input.quantity ?? 1)}`
    );
  }
  for (const unit of units) {
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
