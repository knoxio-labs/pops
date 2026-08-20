/**
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
 * shipments, charges, an accounting split and per-line provenance that a phone
 * does not render, and a schema demanding all of it would turn a producer
 * trimming an unused field into a `502` on a handset.
 */
import { z } from 'zod';

import type {
  MobilePurchase,
  MobilePurchaseDetail,
  MobilePurchaseItem,
} from '../../contract/rest-schemas.js';

/**
 * ISO-8601 with an explicit offset, enforced rather than accepted as a bare
 * string. The offset is not decoration here: {@link calendarDayOf} reads the
 * day out of it, so a producer that started emitting a bare local time would
 * silently change which day every order is on.
 */
const OrderedAtSchema = z.iso.datetime({ offset: true });

/** The order fields a list row is built from. */
export const PurchasesListRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  merchantEntityName: z.string().nullable(),
  totalCents: z.number().int(),
  currency: z.string(),
  orderedAt: OrderedAtSchema,
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
});

/**
 * The detail read.
 *
 * `purchases` answers a `PurchaseDetail` — the order plus its shipments,
 * lines, charges, documents and accounting. Only the order header, the lines
 * and the documents are described, because those are what the mobile detail
 * draws.
 *
 * `itemCount` and `receiptUri` are NOT on this response: they are aggregates
 * the list endpoint computes, and here the same facts are read off the arrays
 * the detail already carries. Two derivations of one number is how a list row
 * and the screen behind it come to disagree, so the derivation is in one
 * function ({@link toMobilePurchaseDetail}) and the arrays are its only input.
 */
export const PurchasesDetailResponseSchema = z.object({
  purchase: z.object({
    id: z.string(),
    source: z.string(),
    merchantEntityName: z.string().nullable(),
    totalCents: z.number().int(),
    subtotalCents: z.number().int(),
    taxCents: z.number().int(),
    shippingCents: z.number().int(),
    discountCents: z.number().int(),
    surchargeCents: z.number().int(),
    currency: z.string(),
    orderedAt: OrderedAtSchema,
    status: z.string(),
  }),
  items: z.array(PurchasesItemSchema),
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

/**
 * The calendar day an ISO-8601 timestamp names AT ITS OWN OFFSET.
 *
 * The whole point is that no ambient zone takes part. `2026-08-20T21:30:00+10:00`
 * is the 20th, and stays the 20th on a handset that has since flown to Los
 * Angeles — where resolving the instant in the device's zone would render the
 * 20th as the 19th and nothing on screen would say why. The transactions leg
 * beside this one shipped that mistake, which is why the day is computed on
 * this side of the wire rather than left to a client.
 *
 * Arithmetic on the epoch rather than string surgery, so an offset that pushes
 * the local time past midnight in either direction lands on the right day:
 * `2026-08-20T23:30:00-05:00` is the 20th locally and the 21st in UTC, and the
 * local answer is the one a reader means.
 */
export function calendarDayOf(timestamp: string): string {
  const offsetMinutes = readOffsetMinutes(timestamp);
  const instant = Date.parse(timestamp);
  if (Number.isNaN(instant)) {
    throw new Error(`[bfm-api] not an ISO-8601 timestamp: ${timestamp}`);
  }
  return new Date(instant + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Minutes east of UTC, from the timestamp's own suffix.
 *
 * `Z` is zero. Anything else the schema admits ends in `±HH:MM`. A string that
 * is neither never reaches here — `OrderedAtSchema` rejects it before the
 * mapping runs — and the throw is what keeps that true rather than defaulting
 * a malformed value to UTC and dating it silently wrong.
 */
function readOffsetMinutes(timestamp: string): number {
  if (timestamp.endsWith('Z') || timestamp.endsWith('z')) return 0;
  const match = /(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2})$/u.exec(timestamp);
  const groups = match?.groups;
  if (groups === undefined) {
    throw new Error(`[bfm-api] timestamp carries no UTC offset: ${timestamp}`);
  }
  const magnitude = Number(groups['hours']) * 60 + Number(groups['minutes']);
  return groups['sign'] === '-' ? -magnitude : magnitude;
}

/** purchases list row → mobile list row. Field-for-field; no arithmetic on money. */
export function toMobilePurchase(row: PurchasesListRow): MobilePurchase {
  return {
    id: row.id,
    merchantName: row.merchantEntityName,
    totalCents: row.totalCents,
    currency: row.currency,
    orderedOn: calendarDayOf(row.orderedAt),
    itemCount: row.itemCount,
    status: row.status,
    receiptUri: row.receiptUri,
  };
}

/** purchases detail → the mobile detail record. */
export function toMobilePurchaseDetail(detail: PurchasesDetailResponse): MobilePurchaseDetail {
  const purchase = detail.purchase;
  return {
    id: purchase.id,
    merchantName: purchase.merchantEntityName,
    totalCents: purchase.totalCents,
    currency: purchase.currency,
    orderedOn: calendarDayOf(purchase.orderedAt),
    orderedAt: purchase.orderedAt,
    itemCount: detail.items.length,
    status: purchase.status,
    receiptUri: firstReceiptUri(detail.documents),
    subtotalCents: purchase.subtotalCents,
    taxCents: purchase.taxCents,
    shippingCents: purchase.shippingCents,
    discountCents: purchase.discountCents,
    surchargeCents: purchase.surchargeCents,
    source: purchase.source,
    items: detail.items.map(toMobilePurchaseItem),
  };
}

function toMobilePurchaseItem(line: z.infer<typeof PurchasesItemSchema>): MobilePurchaseItem {
  return {
    id: line.item.id,
    name: line.item.name,
    quantity: line.item.quantity,
    lineTotalCents: line.item.lineTotalCents,
  };
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
  return documents.find((document) => document.kind === 'receipt')?.documentUri ?? null;
}
