/**
 * Writing `purchase_charges` and the allocations hanging off them — what an
 * order's payments were, and which lines each one paid for.
 *
 * Its own module rather than another block in the order-ingest path: a
 * charge is the grain the reconciliation ladder matches on, so it carries
 * the currency pair and the allocation checks that nothing else in ingest
 * has, and reading those beside the shipment and document inserts obscures
 * that they are the only ones there.
 */
import { InvalidIngestPayloadError } from '../errors.js';
import { purchaseCharges, purchaseItemAllocations } from '../schema.js';
import { expectRow } from './internal.js';
import { shipmentIdFor, type IngestContext } from './purchase-write-context.js';
import { assertAllocationsFit, resolveOrderAmount } from './purchase-write-validation.js';

import type { CreateChargeInput } from './purchase-input.js';

export function insertCharge(ctx: IngestContext, input: CreateChargeInput, position: number): void {
  const orderAmountCents = resolveOrderAmount(ctx, input);
  const rows = ctx.tx
    .insert(purchaseCharges)
    .values({
      purchaseId: ctx.purchase.id,
      shipmentId: shipmentIdFor(ctx, input.shipmentRef),
      sourceChargeRef: input.sourceChargeRef ?? null,
      position,
      amountCents: input.amountCents,
      currency: input.currency ?? ctx.purchase.currency,
      orderAmountCents,
      chargedAt: input.chargedAt ?? null,
      role: input.role ?? 'capture',
      paymentHint: input.paymentHint ?? ctx.purchase.paymentHint,
      origin: input.origin ?? 'merchant',
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning()
    .all();
  insertAllocations(ctx, expectRow(rows, 'createPurchase.charge').id, input);
}

function insertAllocations(ctx: IngestContext, chargeId: string, input: CreateChargeInput): void {
  assertAllocationsFit(input);
  const seen = new Set<string>();
  for (const allocation of input.allocations ?? []) {
    // Checked before the write so the (charge_id, item_id) unique index
    // doesn't fire first and report a 409 against stored data, when the
    // truth is that one charge allocates to the same line twice.
    if (seen.has(allocation.itemRef)) {
      throw new InvalidIngestPayloadError(
        `charge allocates to item ref '${allocation.itemRef}' more than once`
      );
    }
    seen.add(allocation.itemRef);
    const itemId = ctx.itemIds.get(allocation.itemRef);
    if (itemId === undefined) {
      throw new InvalidIngestPayloadError(
        `charge references unknown item ref '${allocation.itemRef}'`
      );
    }
    ctx.tx
      .insert(purchaseItemAllocations)
      .values({ chargeId, itemId, amountCents: allocation.amountCents, createdAt: ctx.now })
      .run();
  }
}
