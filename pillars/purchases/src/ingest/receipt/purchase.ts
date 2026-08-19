/**
 * A gated reading plus the file it came from → one {@link CreatePurchaseInput}.
 *
 * Only runs on readings the gate admitted. That is the whole arrangement:
 * nothing a model said becomes a purchase until the receipt's own total has
 * agreed with it, so this file contains no judgement about whether the
 * figures are believable — only about how to shape them.
 *
 * **The natural key is the uploaded file.** `sourceOrderId` is its SHA-256,
 * which is what makes re-sending the same file a 409 rather than a twin. A
 * merchant order id would be better and is not available: a till slip
 * carries a transaction number in a different place and format for every
 * chain, and a PDF invoice states one this schema does not ask the model
 * for.
 *
 * The hash is necessary and not sufficient. It identifies a *file*, and
 * what people actually do is photograph the same paper twice — three shots
 * of one Salvos receipt wrote three $66.00 purchases at the same minute —
 * or photograph a receipt and later upload the merchant's PDF of it.
 * So the write path also refuses a shop it already holds at the same stated
 * instant for the same amount, which is a check on the receipt rather than
 * on the bytes. It cannot use the merchant name: the same Kmart receipt
 * read twice gave "K MART ASHFIELD" and "K mart". Date-plus-total alone
 * would merge two identical coffees bought an hour apart — the stated
 * *time* is what keeps them separate.
 */
import { createHash } from 'node:crypto';

import { allocateProRata } from '../allocation.js';
import { instantFromLocalParts, instantFromLocalPartsAtOffset } from '../local-time.js';
import { parseAmountCents } from '../money.js';
import { RECEIPT_SOURCE_ID } from '../source-ids.js';
import { resolveCapture } from './capture.js';
import { receiptKey } from './store.js';

import type {
  CreateCaptureInput,
  CreateItemInput,
  CreatePurchaseInput,
} from '../../db/services/purchase-input.js';
import type { ResolvedCapture, TimeReference } from './capture.js';
import type { ExtractedReceipt } from './extraction.js';
import type { AdmissibleGate } from './gate.js';
import type { StoredReceipt } from './store.js';

export { RECEIPT_SOURCE_ID };

/**
 * When the receipt prints a date but no time: midnight, local to the shop.
 *
 * A day boundary that cannot be inferred from the paper is the start of the
 * day it names. That is only safe because the zone is now the receipt's own
 * rather than a global guess — an inferred midnight in the wrong zone would
 * land on the adjacent day, which is why this was midday while every
 * receipt was assumed to be in Sydney.
 */
const ASSUMED_HOUR = 0;

/** Facts about the order that the paper did not actually state. */
export const DATE_UNCERTAIN = 'date-uncertain';
export const TIMEZONE_UNCERTAIN = 'timezone-uncertain';

/**
 * Applied by the cutover migration only, never by this mapper.
 *
 * Before shipping had its own term, a delivery charge was read into
 * `surcharges` and written to `surchargeCents`. Those rows cannot be split
 * afterwards — nothing recorded which surcharge was a delivery — so the
 * tag says the surcharge **may** include delivery. It is on every receipt
 * row with a surcharge, including the many whose surcharge is only a card
 * fee; asserting a clean figure for rows where none exists would be worse.
 */
export const SHIPPING_UNCERTAIN = 'shipping-uncertain';

const DEFAULT_CURRENCY = 'AUD';

export interface ReceiptPurchaseResult {
  readonly purchase: CreatePurchaseInput;
}

/** Everything about the upload that the receipt itself does not state. */
export interface ReceiptContext {
  /** Defaults to now. Stamped by the caller, before the model is asked. */
  readonly uploadedAt?: string;
  readonly capture?: ResolvedCapture;
}

function toItem(
  line: ExtractedReceipt['lines'][number],
  locale: { currency?: string | null }
): CreateItemInput | null {
  const lineTotalCents = parseAmountCents(line.amount, locale);
  if (lineTotalCents === null) return null;

  // Absent means the receipt did not state a count, which is not the same
  // as one — but one is what it costs, and the qualifier that says
  // otherwise is kept verbatim beside it.
  const quantity = line.quantity ?? 1;
  return {
    name: line.description,
    quantity,
    lineTotalCents,
    unitPriceCents: Math.round(lineTotalCents / quantity),
    // Prose the receipt printed, not a classification of the product. The
    // model is never asked what the thing IS — see `extraction.ts`.
    notes: line.unitNote === undefined ? [] : [line.unitNote],
  };
}

/**
 * Split one order-level shipping figure across its lines, pro-rata by
 * each line's own `lineTotalCents`.
 *
 * The receipt states one delivery figure for the whole order — there is
 * no per-line postage the way `Total Amount` states one for Amazon — so
 * this is the same basis the amazon adapter uses for `Shipping Charge`.
 */
function withAllocatedShipping(
  items: readonly CreateItemInput[],
  shippingCents: number
): CreateItemInput[] {
  const shares = allocateProRata(
    shippingCents,
    items.map((item) => item.lineTotalCents)
  );
  return items.map((item, index) => ({ ...item, allocatedShippingCents: shares[index] ?? 0 }));
}

/**
 * The capture facts worth persisting, or nothing.
 *
 * Provenance travels with each fact rather than with the row: a client that
 * sends only a location leaves the capture time to the camera, and a reader
 * that cannot tell those apart cannot judge either.
 */
function captureInput(capture: ResolvedCapture): CreateCaptureInput {
  return {
    capturedAt: capture.capturedAt,
    capturedAtSource: capture.capturedAtSource,
    utcOffsetMinutes: capture.utcOffsetMinutes,
    declaredTimeZone: capture.declaredTimeZone,
    latitude: capture.location?.latitude ?? null,
    longitude: capture.location?.longitude ?? null,
    locationSource: capture.locationSource,
  };
}

/**
 * The moment the shop happened, or null when the paper does not say.
 *
 * Null is not a failure here — the caller dates it from the upload and marks
 * it — but a date the receipt states badly (`2026-02-31`) is treated the
 * same as none at all, because a normalised 3 March is a fabrication either
 * way.
 */
function occurredAt(extracted: ExtractedReceipt, reference: TimeReference): string | null {
  if (extracted.purchasedOn === null) return null;
  const [year, month, day] = extracted.purchasedOn.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;

  const [hour, minute] =
    extracted.purchasedAt === null
      ? [ASSUMED_HOUR, 0]
      : extracted.purchasedAt.split(':').map(Number);

  const parts = { year, month, day, hour: hour ?? ASSUMED_HOUR, minute: minute ?? 0 };
  return reference.kind === 'offset'
    ? instantFromLocalPartsAtOffset(parts, reference.offsetMinutes)
    : instantFromLocalParts(parts, reference.zone);
}

/**
 * Content hash over what was mapped, plus the file it came from.
 *
 * The file hash alone would be enough for dedup, and is not enough for
 * change detection: re-reading the same upload with a better model should
 * look different, because it is.
 *
 * Which is why the surcharge and shipping components are in it. Moving a
 * $9.95 delivery fee out of one and into the other leaves the total, the
 * discount and every line untouched, so a recipe over those alone would
 * call the corrected reading identical to the one it corrects — exactly
 * the change this hash exists to make visible.
 */
function checksumFor(key: string, purchase: Omit<CreatePurchaseInput, 'checksum'>): string {
  const hash = createHash('sha256');
  hash.update(`${RECEIPT_SOURCE_ID}:${key}:${purchase.orderedAt}`);
  hash.update(`:${String(purchase.totalCents)}:${String(purchase.discountCents ?? 0)}`);
  hash.update(`:${String(purchase.surchargeCents ?? 0)}:${String(purchase.shippingCents ?? 0)}`);
  for (const item of purchase.items ?? []) {
    hash.update(
      JSON.stringify([
        item.name,
        item.quantity,
        item.unitPriceCents,
        item.lineTotalCents,
        item.notes,
      ])
    );
  }
  return hash.digest('hex');
}

/**
 * Shape an admitted reading into a purchase.
 *
 * Takes {@link AdmissibleGate} rather than the full {@link GateResult}
 * union, so a reading the gate refused cannot reach this function at all —
 * the compiler enforces what a runtime `!gate.admissible` check used to.
 *
 * Always produces one. A receipt that states no date is dated from its
 * upload and tagged `date-uncertain`, rather than refused: the shop
 * happened and the evidence exists, so losing it would be worse than
 * carrying an inferred date — provided the inference is never mistaken for
 * something the receipt said, which is what the tag is for.
 *
 * The upload instant, not midnight on the upload day: it is a guess either
 * way, and pretending to a precision the guess does not have would make it
 * harder to spot. A reviewer setting the real date replaces it wholesale.
 *
 * When something states when the photograph was taken — the client, or the
 * camera — that instant stands in for the upload in the same fallback, and
 * the tag stays. The shutter fired closer to the shop than the upload did,
 * and by an unbounded margin: a receipt photographed in October and
 * uploaded in December is dated December without it.
 *
 * `capture` defaults to what an upload carrying no metadata resolves to,
 * which is the zone the model inferred or the configured default — exactly
 * the behaviour this function had before any of it existed.
 */
export function receiptToPurchase(
  extracted: ExtractedReceipt,
  gate: AdmissibleGate,
  stored: readonly StoredReceipt[],
  context: ReceiptContext = {}
): ReceiptPurchaseResult {
  const uploadedAt = context.uploadedAt ?? new Date().toISOString();
  const capture = context.capture ?? resolveCapture(undefined, null, extracted.timeZone);
  const key = receiptKey(stored);
  const [first] = stored;
  if (first === undefined) {
    throw new Error('receiptToPurchase needs at least one stored part');
  }
  const stated = occurredAt(extracted, capture.timeReference);
  const orderedAt = stated ?? capture.capturedAt ?? uploadedAt;

  const tags = [
    ...(stated === null ? [DATE_UNCERTAIN] : []),
    ...(capture.zoneCertain ? [] : [TIMEZONE_UNCERTAIN]),
  ];

  const locale = { currency: extracted.currency };
  const readItems = extracted.lines
    .map((line) => toItem(line, locale))
    .filter((item): item is CreateItemInput => item !== null);
  const totalCents = gate.totalCents;
  const items = withAllocatedShipping(readItems, gate.shippingCents);

  const withoutChecksum: Omit<CreatePurchaseInput, 'checksum'> = {
    source: RECEIPT_SOURCE_ID,
    // The photograph is the key. See the file comment.
    sourceOrderId: key,
    ingestMethod: 'upload',
    orderedAt,
    currency: extracted.currency ?? DEFAULT_CURRENCY,
    subtotalCents: gate.lineTotalCents,
    // Zero when the price already contained it: the receipt states the tax
    // as a fact about the total, not as a component to add. Carrying it
    // here as well would make it appear twice in any sum of parts — the
    // same reason the Woolworths adapter drops GST.
    taxCents: gate.taxIncluded ? 0 : gate.taxCents,
    surchargeCents: gate.surchargeCents,
    // Its own column, so "what did delivery cost this year" is answerable
    // and a delivery fee is not indistinguishable from a card surcharge.
    // The amazon adapter already writes this column; the receipt path was
    // the outlier.
    shippingCents: gate.shippingCents,
    discountCents: gate.discountCents,
    totalCents,
    // Unknown is a valid outcome, not a failure — the escape hatch exists
    // precisely for merchants nothing else recognises.
    merchantEntityName: extracted.merchantName,
    // The paper does not say how it was paid for often enough to guess, and
    // `cash` is terminal — a real card shop marked that way is excluded
    // from reconciliation forever. The reviewer sets it (ADR-042).
    settlementMode: 'unknown',
    rawRef: first.uri,
    tags,
    items,
    charges: [
      {
        amountCents: totalCents,
        chargedAt: orderedAt,
        role: 'capture',
        origin: 'merchant',
      },
    ],
    // Every part, in the order it was sent: each is evidence for the same
    // shop, and a reviewer needs all of them to check a long receipt
    // against what was read from it.
    documents: stored.map((one) => ({ documentUri: one.uri, kind: 'receipt' as const })),
    // Deliberately outside the checksum below. The checksum answers "would
    // re-reading this upload produce a different purchase", and these are
    // facts about the photograph rather than about the reading — a client
    // that starts sending coordinates for uploads it already sent has not
    // corrected anything the recipe describes.
    capture: captureInput(capture),
  };

  return { purchase: { ...withoutChecksum, checksum: checksumFor(key, withoutChecksum) } };
}
