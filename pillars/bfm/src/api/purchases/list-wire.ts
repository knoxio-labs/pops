/*
 * The purchase shapes bfm reads from `purchases`, and the mapping from them to
 * the mobile shapes bfm publishes.
 *
 * Validated rather than trusted, for the reason the finance leg validates: the
 * SDK proxy resolves routes from the producer's OpenAPI at runtime, so the
 * local router type is an assertion and not a check. The stakes here are a
 * list of what somebody spent — a producer-side rename would arrive as
 * `undefined` and reach a phone as a row with no merchant and a total of
 * nothing, which reads as a bad receipt rather than as a broken wire.
 *
 * Money is `purchases`' and is mirrored: integer cents, exactly as that pillar
 * persists and publishes it.
 *
 * Only what the mobile shapes draw is described. `purchases`' record carries
 * shipments, allocations and per-line provenance that a phone does not
 * render, and a schema demanding all of it would turn a producer trimming an
 * unused field into a `502` on a handset.
 */
import { z } from 'zod';

import { parseSoftUri } from '@pops/pillar-sdk';

import {
  PurchasesAccountingSchema,
  PurchasesChargeDetailSchema,
  toMobileAccounting,
  toMobileCharges,
} from './bank-match-wire.js';
import { calendarDayOf } from './calendar-day.js';
import { toMerchantIdentity } from './merchant-identity.js';

import type { MobileMatchedTransaction } from '../../contract/mobile-purchase-bank-match-schemas.js';
import type {
  MobilePurchase,
  MobilePurchaseDetail,
  MobilePurchaseItem,
} from '../../contract/rest-schemas.js';

/**
 * ISO-8601 with an explicit offset, enforced rather than accepted as a bare
 * string. A producer that started emitting a bare local time would name no
 * instant at all, and every order would be placed by however far the shop
 * is from Greenwich.
 *
 * It does NOT follow that the offset says where the order happened.
 * `purchases` canonicalises this column to UTC so that a text comparison
 * over it is a chronological one, so in practice it always ends in `Z` —
 * which is why the merchant-local day is read from
 * {@link OrderedAtOffsetSchema} and not out of this string.
 */
const OrderedAtSchema = z.iso.datetime({ offset: true });

/**
 * Minutes ahead of UTC where the order was placed, as `purchases` recorded
 * it — the fact that makes the merchant-local calendar day recoverable.
 *
 * Optional as well as nullable, and the two mean different things. Null is
 * the producer saying it never knew an offset: an export whose source
 * stated an instant rather than a printed wall clock, or a row written
 * before that pillar had anywhere to keep one. Absent is an older producer
 * that cannot say at all — and it is read as null rather than refused,
 * because such a producer has no offsets stored either, so the honest
 * answer is the same one and a `502` on a handset would be worse than a
 * date in UTC.
 */
const OrderedAtOffsetSchema = z.int().min(-840).max(840).nullable().optional();

/** The order fields a list row is built from. */
export const PurchasesListRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  /**
   * A resolved `contacts` entity, when `purchases` has one. See
   * `merchant-identity.ts`.
   *
   * Optional as well as nullable, for the same reason
   * {@link OrderedAtOffsetSchema} is: a write path that never set this
   * column (a manual entry, an older producer build) can omit the key
   * outright, and that is the same fact as an explicit `null` — no entity.
   * Requiring the key would turn that omission into a `502` for the whole
   * page over a field this pillar treats as absent either way.
   */
  merchantEntityId: z.string().nullable().optional(),
  merchantEntityName: z.string().nullable(),
  totalCents: z.number().int(),
  currency: z.string(),
  orderedAt: OrderedAtSchema,
  orderedAtOffsetMinutes: OrderedAtOffsetSchema,
  /**
   * Open, not the producer's enum, for the reason the finance leg leaves
   * `type` open: `purchases` adding a status must not make every order fail to
   * render on the phone. Nothing here branches on it.
   */
  status: z.string(),
  itemCount: z.number().int().min(0),
  receiptUri: z.string().nullable(),
});

export type PurchasesListRow = z.infer<typeof PurchasesListRowSchema>;

export const PurchasesListResponseSchema = z.object({
  items: z.array(PurchasesListRowSchema),
  total: z.number().int().min(0).optional(),
});

/**
 * One line, as `purchases` nests it: the row under `item`, with the
 * classification, notes, units and landed cost the detail read hangs beside it.
 *
 * The nesting is the producer's and is read rather than flattened away in the
 * schema, because a schema that described a flat line would be describing a
 * shape `purchases` does not send — which is what a live seam catches and a
 * hand-written fake agrees with all the way to production.
 */
const PurchasesItemSchema = z.object({
  item: z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number().int().min(1),
    lineTotalCents: z.number().int(),
  }),
  /**
   * Optional for producer compatibility: purchases builds before per-unit
   * Inventory links omit the collection. Absence means this BFM has no link
   * evidence for the line, the same mobile answer as an empty collection.
   */
  units: z
    .array(
      z.object({
        inventoryItemUri: z.string().nullable(),
        inventoryItemStaleAt: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/**
 * The detail read.
 *
 * `purchases` answers a `PurchaseDetail` — the order plus its shipments,
 * lines, charges, documents and accounting. Shipments and allocations are
 * not described, because the mobile detail does not draw them.
 *
 * `itemCount` and `receiptUri` are NOT on this response: they are aggregates
 * the list endpoint computes, and here the same facts are read off the arrays
 * the detail already carries. Two derivations of one number is how a list row
 * and the screen behind it come to disagree, so the derivation is in one
 * function ({@link toMobilePurchaseDetail}) and the arrays are its only input.
 */
/** `purchases`' edit summary — see `MobilePurchaseEditSchema` for the mobile shape it maps onto. */
const PurchasesEditSchema = z.object({
  editedAt: z.string(),
  changes: z.array(
    z.object({
      field: z.string(),
      itemId: z.string().nullable(),
      original: z.string().nullable(),
      current: z.string().nullable(),
    })
  ),
});

export const PurchasesDetailResponseSchema = z.object({
  /**
   * Optional as well as nullable, matching `merchantEntityId`'s precedent
   * just below: a producer build that predates the edit feature (POPS-2458)
   * — the iOS UI-flow lane's hand-written stub, or a `purchases` that has
   * not yet redeployed alongside this bfm — omits the key outright, and
   * that is the same fact a `null` states explicitly: never edited.
   * Requiring the key would turn that omission into a `502` on the whole
   * detail over a field no reader here treats as anything but absent.
   */
  edit: PurchasesEditSchema.nullable().optional(),
  purchase: z.object({
    id: z.string(),
    source: z.string(),
    merchantEntityId: z.string().nullable().optional(),
    merchantEntityName: z.string().nullable(),
    totalCents: z.number().int(),
    subtotalCents: z.number().int(),
    taxCents: z.number().int(),
    shippingCents: z.number().int(),
    discountCents: z.number().int(),
    surchargeCents: z.number().int(),
    currency: z.string(),
    orderedAt: OrderedAtSchema,
    orderedAtOffsetMinutes: OrderedAtOffsetSchema,
    status: z.string(),
    /**
     * Optional for the same reason `edit` above is: a producer that
     * predates POPS-2458 sends no such column. Absent means bfm cannot
     * hand the phone a value to round-trip as `expectedUpdatedAt` — see
     * {@link toMobilePurchaseDetail}, which maps that case to `null` on
     * the mobile wire rather than fabricating a timestamp. A phone that
     * gets `null` here has nothing valid to send back, and the write
     * contract's `expectedUpdatedAt` stays a required field — refusing an
     * edit for want of a compare-and-swap value, rather than accepting one
     * with no staleness check at all.
     */
    updatedAt: z.string().optional(),
  }),
  items: z.array(PurchasesItemSchema),
  charges: z.array(PurchasesChargeDetailSchema),
  accounting: PurchasesAccountingSchema,
  documents: z.array(
    z.object({
      documentUri: z.string(),
      /** Open, for the same reason `status` is. Only `receipt` is matched on. */
      kind: z.string(),
      createdAt: z.string(),
    })
  ),
});

export type PurchasesDetailResponse = z.infer<typeof PurchasesDetailResponseSchema>;

/** purchases list row → mobile list row. Field-for-field; no arithmetic on money. */
export function toMobilePurchase(
  row: PurchasesListRow,
  mergedNames: ReadonlyMap<string, string> = new Map()
): MobilePurchase {
  return {
    id: row.id,
    merchant: toMerchantIdentity(row.merchantEntityId ?? null, row.merchantEntityName, mergedNames),
    merchantName: row.merchantEntityName,
    totalCents: row.totalCents,
    currency: row.currency,
    orderedOn: calendarDayOf(row.orderedAt, row.orderedAtOffsetMinutes ?? null),
    itemCount: row.itemCount,
    status: row.status,
    receiptUri: row.receiptUri,
  };
}

/** purchases detail → the mobile detail record. */
export function toMobilePurchaseDetail(
  detail: PurchasesDetailResponse,
  mergedNames: ReadonlyMap<string, string> = new Map(),
  transactions: ReadonlyMap<string, MobileMatchedTransaction> = new Map()
): MobilePurchaseDetail {
  const purchase = detail.purchase;
  const offsetMinutes = purchase.orderedAtOffsetMinutes ?? null;
  return {
    id: purchase.id,
    merchant: toMerchantIdentity(
      purchase.merchantEntityId ?? null,
      purchase.merchantEntityName,
      mergedNames
    ),
    merchantName: purchase.merchantEntityName,
    totalCents: purchase.totalCents,
    currency: purchase.currency,
    orderedOn: calendarDayOf(purchase.orderedAt, offsetMinutes),
    orderedAt: purchase.orderedAt,
    itemCount: detail.items.length,
    status: purchase.status,
    receiptUri: firstReceiptUri(detail.documents),
    receiptUris: receiptUris(detail.documents),
    subtotalCents: purchase.subtotalCents,
    taxCents: purchase.taxCents,
    shippingCents: purchase.shippingCents,
    discountCents: purchase.discountCents,
    surchargeCents: purchase.surchargeCents,
    source: purchase.source,
    items: detail.items.map(toMobilePurchaseItem),
    // `?? null`, not left undefined: a producer that predates the edit
    // feature omits the key outright, and that is the same fact a `null`
    // states explicitly — see the schema's own comment on each field.
    updatedAt: purchase.updatedAt ?? null,
    edit:
      detail.edit === null || detail.edit === undefined
        ? null
        : { editedAt: detail.edit.editedAt, changes: detail.edit.changes },
    accounting: toMobileAccounting(detail.accounting),
    charges: toMobileCharges(detail.charges, offsetMinutes, transactions),
  };
}

function toMobilePurchaseItem(line: z.infer<typeof PurchasesItemSchema>): MobilePurchaseItem {
  return {
    id: line.item.id,
    name: line.item.name,
    quantity: line.item.quantity,
    lineTotalCents: line.item.lineTotalCents,
    hasInventoryLink: line.units?.some(hasInventoryItemUri) ?? false,
  };
}

function hasInventoryItemUri(unit: { inventoryItemUri: string | null }): boolean {
  if (unit.inventoryItemUri === null) return false;
  const parsed = parseSoftUri(unit.inventoryItemUri);
  return parsed?.pillar === 'inventory' && parsed.type === 'item' && /^[^/\s]+$/u.test(parsed.id);
}

/** Every receipt-kind document, in the order `purchases` returned them. */
function receiptUris(documents: readonly { documentUri: string; kind: string }[]): string[] {
  return documents
    .filter((document) => document.kind === 'receipt')
    .map((document) => document.documentUri);
}

/**
 * The first receipt-kind document, matching what the producer's list endpoint
 * picks for the same order.
 *
 * `purchases` returns documents ordered `(createdAt, id)` and computes its
 * list-row `receiptUri` under the same ordering, so taking the first here
 * makes the detail screen name the same receipt the row that opened it did.
 */
function firstReceiptUri(
  documents: readonly { documentUri: string; kind: string }[]
): string | null {
  return receiptUris(documents).at(0) ?? null;
}
