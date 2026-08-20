/**
 * Order ingest — writes an order and everything hanging off it in one
 * transaction.
 *
 * Deliberately contains no matching logic. The reconciliation engine
 * consumes these rows; nothing here decides which charge pays for which
 * line, it only records what an adapter was told.
 *
 * The insert helpers share an `IngestContext` (see
 * `purchase-write-context.ts`) rather than threading six positional
 * arguments each, so adding a table to the graph does not mean changing
 * every signature.
 */
import {
  DuplicatePurchaseError,
  InvalidIngestPayloadError,
  PurchaseSourceNotFoundError,
} from '../errors.js';
import {
  purchaseCharges,
  purchaseItemAllocations,
  purchases,
  purchaseShipments,
  purchaseTags,
} from '../schema.js';
import { expectRow, nowIso, type PurchasesDb } from './internal.js';
import { insertPurchaseDocument } from './purchase-documents.js';
import { findPurchaseByChecksum, findPurchaseBySourceOrderId } from './purchase-lookups.js';
import { insertCapture } from './purchase-write-capture.js';
import { componentCents, shipmentIdFor, type IngestContext } from './purchase-write-context.js';
import { insertItem } from './purchase-write-items.js';
import { assertAllocationsFit, resolveOrderAmount } from './purchase-write-validation.js';
import { getSource } from './sources.js';

import type { PurchaseRow } from '../schema.js';
import type {
  CreateChargeInput,
  CreateDocumentInput,
  CreatePurchaseInput,
  CreateShipmentInput,
} from './purchase-input.js';

export type {
  CreateCaptureInput,
  CreateChargeAllocationInput,
  CreateChargeInput,
  CreateDocumentInput,
  CreateItemInput,
  CreateItemUnitInput,
  CreatePurchaseInput,
  CreateShipmentInput,
} from './purchase-input.js';

/**
 * Write an order, its deliveries, lines, charges and documents in one
 * transaction, and return the new order's id.
 *
 * Throws {@link DuplicatePurchaseError} when `checksum` already exists so
 * an adapter can skip rather than duplicate, and
 * {@link PurchaseSourceNotFoundError} when `source` names a row that isn't
 * registered — a typo'd source would otherwise create an order the linker
 * can never block on.
 */
export function createPurchase(db: PurchasesDb, input: CreatePurchaseInput): string {
  return db.transaction((tx) => {
    if (getSource(tx, input.source) === undefined) {
      throw new PurchaseSourceNotFoundError(input.source);
    }
    assertNotAlreadyImported(tx, input);

    // One timestamp for the whole transaction. Calling nowIso() twice can
    // put the order row a millisecond ahead of its own children, which
    // makes an atomically-written graph look like it arrived in pieces.
    const now = nowIso();
    const ctx: IngestContext = {
      tx,
      purchase: insertOrder(tx, input, now),
      shipmentIds: new Map(),
      shipmentSourceRefs: new Set(),
      itemIds: new Map(),
      now,
    };

    // A Set so a caller that repeats a tag does not trip the
    // (purchase_id, tag) primary key.
    for (const tag of new Set(input.tags ?? [])) {
      tx.insert(purchaseTags).values({ purchaseId: ctx.purchase.id, tag, createdAt: now }).run();
    }

    for (const [position, shipment] of (input.shipments ?? []).entries()) {
      insertShipment(ctx, shipment, position);
    }
    for (const [position, item] of (input.items ?? []).entries()) {
      insertItem(ctx, item, position);
    }
    for (const [position, charge] of (input.charges ?? []).entries()) {
      insertCharge(ctx, charge, position);
    }
    for (const document of input.documents ?? []) {
      insertDocument(ctx, document);
    }
    insertCapture(ctx, input.capture);

    return ctx.purchase.id;
  });
}

/**
 * Reject an order we already hold, under either identity.
 *
 * The `(source, source_order_id)` unique index would catch the second case
 * on its own, but would report it as a generic conflict. An adapter that
 * changed its checksum recipe is still re-running the same import and must
 * get back the same "already have it" signal it branches on to skip.
 */
function assertNotAlreadyImported(tx: PurchasesDb, input: CreatePurchaseInput): void {
  if (findPurchaseByChecksum(tx, input.checksum) !== undefined) {
    throw new DuplicatePurchaseError(input.checksum, 'checksum');
  }
  if (input.sourceOrderId == null) return;
  const existing = findPurchaseBySourceOrderId(tx, input.source, input.sourceOrderId);
  if (existing !== undefined) {
    throw new DuplicatePurchaseError(existing.checksum, 'source-order-id');
  }
}

function insertOrder(tx: PurchasesDb, input: CreatePurchaseInput, now: string): PurchaseRow {
  const rows = tx
    .insert(purchases)
    .values({
      source: input.source,
      sourceOrderId: input.sourceOrderId ?? null,
      ingestMethod: input.ingestMethod,
      orderedAt: input.orderedAt,
      currency: input.currency,
      ...componentCents(input),
      totalCents: input.totalCents,
      merchantEntityId: input.merchantEntityId ?? null,
      merchantEntityName: input.merchantEntityName ?? null,
      settlementMode: input.settlementMode ?? 'unknown',
      paymentHint: input.paymentHint ?? null,
      rawRef: input.rawRef ?? null,
      checksum: input.checksum,
      // Cash is terminal on arrival: no transaction will ever settle it, so
      // it must never enter the reconcile queue (ADR-042).
      status: input.settlementMode === 'cash' ? 'settled_cash' : 'awaiting_settlement',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();
  return expectRow(rows, 'createPurchase');
}

function insertShipment(ctx: IngestContext, input: CreateShipmentInput, position: number): void {
  // Both identities are checked before the write, not after. The
  // (purchase_id, source_shipment_ref) unique index would otherwise fire
  // first and surface as a 409 "conflicts with existing data", when the
  // truth is that this one payload names the same delivery twice.
  //
  // Two checks, not one, because `ref` and `sourceShipmentRef` are
  // different things: a payload can repeat a merchant shipment id under
  // two distinct wiring handles, which the ref check alone cannot see.
  if (ctx.shipmentIds.has(input.ref)) {
    throw new InvalidIngestPayloadError(`duplicate shipment ref '${input.ref}'`);
  }
  if (input.sourceShipmentRef != null) {
    if (ctx.shipmentSourceRefs.has(input.sourceShipmentRef)) {
      throw new InvalidIngestPayloadError(
        `duplicate merchant shipment id '${input.sourceShipmentRef}'`
      );
    }
    ctx.shipmentSourceRefs.add(input.sourceShipmentRef);
  }
  const rows = ctx.tx
    .insert(purchaseShipments)
    .values({
      purchaseId: ctx.purchase.id,
      sourceShipmentRef: input.sourceShipmentRef ?? null,
      position,
      carrier: input.carrier ?? null,
      trackingNumber: input.trackingNumber ?? null,
      shippedAt: input.shippedAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      status: input.status ?? 'pending',
      shippingCents: input.shippingCents ?? 0,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning()
    .all();
  ctx.shipmentIds.set(input.ref, expectRow(rows, 'createPurchase.shipment').id);
}

function insertCharge(ctx: IngestContext, input: CreateChargeInput, position: number): void {
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

function insertDocument(ctx: IngestContext, input: CreateDocumentInput): void {
  insertPurchaseDocument(ctx.tx, {
    purchaseId: ctx.purchase.id,
    shipmentId: shipmentIdFor(ctx, input.shipmentRef),
    documentUri: input.documentUri,
    kind: input.kind ?? 'other',
    createdAt: ctx.now,
  });
}
