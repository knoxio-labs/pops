/**
 * The line grain and below: a line, its tags, its notes, and its units.
 *
 * Split from `purchase-writes.ts` to keep both files under the per-file
 * size limit — the line is the only part of the order graph with children
 * of its own.
 *
 * Tags and notes go to different tables on purpose. A note is prose the
 * merchant printed and an adapter transcribed; a tag is a POPS
 * classification nothing in any source states. An ingest payload that
 * supplies a tag is therefore *asserting* one, which is why tags written
 * here land confirmed — the same reason a source-stated `kind` does.
 */
import { isItemTag, isWellFormedSku } from '../../contract/constants.js';
import { InvalidIngestPayloadError } from '../errors.js';
import {
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
} from '../schema.js';
import { expectRow } from './internal.js';
import { shipmentIdFor, type IngestContext } from './purchase-write-context.js';

import type { PurchaseItemInsert } from '../schema.js';
import type { CreateItemInput } from './purchase-input.js';

export function insertItem(ctx: IngestContext, input: CreateItemInput, position: number): void {
  const rows = ctx.tx
    .insert(purchaseItems)
    .values(itemRow(ctx, input, position))
    .returning()
    .all();
  const itemId = expectRow(rows, 'createPurchase.item').id;
  registerItemRef(ctx, input.ref, position, itemId);

  insertItemTags(ctx, itemId, input);
  insertItemNotes(ctx, itemId, input);
  insertItemUnits(ctx, itemId, input);
}

/**
 * The identifier as it will be stored, once the namespace it claims has been
 * checked against it.
 *
 * The wire schema applies the same rule, and this is not a second copy of it
 * — `isWellFormedSku` is the one predicate, applied here as well because the
 * shipped adapters build a payload in-process and never pass through zod.
 * An `asin` that cannot be an ASIN is the accidental cross-source merge the
 * pair exists to prevent, and a blank identifier is an identity minted from
 * nothing, which is what NULL is for.
 */
function skuColumns(input: CreateItemInput): Pick<PurchaseItemInsert, 'sku' | 'skuScheme'> {
  const identity = input.sku;
  if (identity == null) return { sku: null, skuScheme: null };
  if (!isWellFormedSku(identity.scheme, identity.value)) {
    throw new InvalidIngestPayloadError(
      `product identifier '${identity.value}' cannot belong to the '${identity.scheme}' namespace it claims`
    );
  }
  return { sku: identity.value, skuScheme: identity.scheme };
}

function itemRow(ctx: IngestContext, input: CreateItemInput, position: number): PurchaseItemInsert {
  return {
    purchaseId: ctx.purchase.id,
    shipmentId: shipmentIdFor(ctx, input.shipmentRef),
    position,
    name: input.name,
    // Split at exactly one site, from one value, so no caller can name an
    // identifier without the namespace that says how far it means anything.
    ...skuColumns(input),
    url: input.url ?? null,
    imageUrl: input.imageUrl ?? null,
    quantity: input.quantity ?? 1,
    unitPriceCents: input.unitPriceCents,
    lineTotalCents: input.lineTotalCents,
    allocatedShippingCents: input.allocatedShippingCents ?? 0,
    allocatedAdjustmentCents: input.allocatedAdjustmentCents ?? 0,
    ...productFacts(input, ctx.now),
    createdAt: ctx.now,
  };
}

/**
 * What the source says about the *thing*, as opposed to about the money.
 *
 * Every one of these defaults to null rather than to something plausible.
 * An absent `gstApplicable` means the source did not say, which is a
 * different fact from "no GST" and the reason the column is nullable.
 */
function productFacts(
  input: CreateItemInput,
  now: string
): Pick<
  PurchaseItemInsert,
  | 'merchantCategory'
  | 'merchantCondition'
  | 'promotionalPrice'
  | 'gstApplicable'
  | 'kind'
  | 'kindConfirmedAt'
> {
  return {
    merchantCategory: input.merchantCategory ?? null,
    merchantCondition: input.merchantCondition ?? null,
    promotionalPrice: input.promotionalPrice ?? null,
    gstApplicable: input.gstApplicable ?? null,
    kind: input.kind ?? null,
    // A kind an adapter supplies came off the source document, so it is a
    // transcription rather than a proposal and the classification pass must
    // not reconsider it. Null when there is no kind: the CHECK forbids a
    // confirmation with nothing under it.
    kindConfirmedAt: input.kind == null ? null : now,
  };
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
  // (item_id, tag) primary key. Safe for tags and wrong for notes, where
  // two identical notes are two notes — which is why they are separate.
  for (const tag of new Set(input.tags ?? [])) {
    if (!isItemTag(tag)) {
      throw new InvalidIngestPayloadError(
        `item tag '${tag}' is not a lower-case slug; purchases' item vocabulary is open but its shape is not`
      );
    }
    ctx.tx
      .insert(purchaseItemTags)
      .values({ itemId, tag, createdAt: ctx.now, confirmedAt: ctx.now })
      .run();
  }
}

/**
 * Merchant prose, in the order it was printed.
 *
 * No de-duplication, deliberately: a receipt that prints the same weight
 * line twice printed it twice, and the position is what a reviewer checks
 * the reading against.
 */
function insertItemNotes(ctx: IngestContext, itemId: string, input: CreateItemInput): void {
  (input.notes ?? []).forEach((note, position) => {
    ctx.tx.insert(purchaseItemNotes).values({ itemId, position, note, createdAt: ctx.now }).run();
  });
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
