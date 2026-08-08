/**
 * A gated reading plus its photograph → one {@link CreatePurchaseInput}.
 *
 * Only runs on readings the gate admitted. That is the whole arrangement:
 * nothing a model said becomes a purchase until the receipt's own total has
 * agreed with it, so this file contains no judgement about whether the
 * figures are believable — only about how to shape them.
 *
 * **The natural key is the photograph.** `sourceOrderId` is the image's
 * SHA-256, which is what makes a re-upload a 409 from the existing write
 * path rather than a twin. A merchant order id would be better and does not
 * exist: a till slip carries a transaction number in a different place and
 * format for every chain, and inventing a key from date-plus-total would
 * merge two identical coffees bought an hour apart.
 */
import { createHash } from 'node:crypto';

import { instantFromLocalParts, isKnownTimeZone, storeTimeZone } from '../local-time.js';
import { parseAmountCents } from '../money.js';

import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ExtractedReceipt } from './extraction.js';
import type { GateResult } from './gate.js';
import type { StoredReceipt } from './store.js';

export const RECEIPT_SOURCE_ID = 'receipt';

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

const DEFAULT_CURRENCY = 'AUD';

export interface ReceiptPurchaseResult {
  readonly purchase: CreatePurchaseInput;
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
    tags: line.unitNote === undefined ? [] : [line.unitNote],
  };
}

/**
 * Where the shop is, and how sure we are.
 *
 * The model infers a zone from the printed address, so it can name one that
 * does not exist. A rejected guess falls back to the configured default and
 * says so, rather than throwing inside a date calculation or silently
 * placing a Paris receipt in Sydney.
 */
function resolveZone(extracted: ExtractedReceipt): { zone: string; certain: boolean } {
  return isKnownTimeZone(extracted.timeZone)
    ? { zone: extracted.timeZone, certain: true }
    : { zone: storeTimeZone(), certain: false };
}

/**
 * The moment the shop happened, or null when the paper does not say.
 *
 * Null is not a failure here — the caller dates it from the upload and marks
 * it — but a date the receipt states badly (`2026-02-31`) is treated the
 * same as none at all, because a normalised 3 March is a fabrication either
 * way.
 */
function occurredAt(extracted: ExtractedReceipt, zone: string): string | null {
  if (extracted.purchasedOn === null) return null;
  const [year, month, day] = extracted.purchasedOn.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;

  const [hour, minute] =
    extracted.purchasedAt === null
      ? [ASSUMED_HOUR, 0]
      : extracted.purchasedAt.split(':').map(Number);

  return instantFromLocalParts(
    { year, month, day, hour: hour ?? ASSUMED_HOUR, minute: minute ?? 0 },
    zone
  );
}

/**
 * Content hash over what was mapped, plus the image it came from.
 *
 * The image hash alone would be enough for dedup, and is not enough for
 * change detection: re-reading the same photograph with a better model
 * should look different, because it is.
 */
function checksumFor(
  stored: StoredReceipt,
  purchase: Omit<CreatePurchaseInput, 'checksum'>
): string {
  const hash = createHash('sha256');
  hash.update(`${RECEIPT_SOURCE_ID}:${stored.sha256}:${purchase.orderedAt}`);
  hash.update(`:${String(purchase.totalCents)}:${String(purchase.discountCents ?? 0)}`);
  for (const item of purchase.items ?? []) {
    hash.update(
      JSON.stringify([
        item.name,
        item.quantity,
        item.unitPriceCents,
        item.lineTotalCents,
        item.tags,
      ])
    );
  }
  return hash.digest('hex');
}

/**
 * Shape an admitted reading into a purchase.
 *
 * Always produces one. A receipt that states no date is dated from its
 * upload and tagged `date-uncertain`, rather than refused: the shop
 * happened and the photograph exists, so losing it would be worse than
 * carrying an inferred date — provided the inference is never mistaken for
 * something the paper said, which is what the tag is for.
 *
 * The upload instant, not midnight on the upload day: it is a guess either
 * way, and pretending to a precision the guess does not have would make it
 * harder to spot. A reviewer setting the real date replaces it wholesale.
 */
export function receiptToPurchase(
  extracted: ExtractedReceipt,
  gate: GateResult,
  stored: StoredReceipt,
  uploadedAt: string = new Date().toISOString()
): ReceiptPurchaseResult {
  const { zone, certain: zoneCertain } = resolveZone(extracted);
  const stated = occurredAt(extracted, zone);
  const orderedAt = stated ?? uploadedAt;

  const tags = [
    ...(stated === null ? [DATE_UNCERTAIN] : []),
    ...(zoneCertain ? [] : [TIMEZONE_UNCERTAIN]),
  ];

  const locale = { currency: extracted.currency };
  const items = extracted.lines
    .map((line) => toItem(line, locale))
    .filter((item): item is CreateItemInput => item !== null);
  const totalCents = gate.totalCents ?? 0;

  const withoutChecksum: Omit<CreatePurchaseInput, 'checksum'> = {
    source: RECEIPT_SOURCE_ID,
    // The photograph is the key. See the file comment.
    sourceOrderId: stored.sha256,
    ingestMethod: 'upload',
    orderedAt,
    currency: extracted.currency ?? DEFAULT_CURRENCY,
    subtotalCents: gate.lineTotalCents,
    taxCents: gate.taxCents,
    discountCents: gate.discountCents,
    totalCents,
    // Unknown is a valid outcome, not a failure — the escape hatch exists
    // precisely for merchants nothing else recognises.
    merchantEntityName: extracted.merchantName,
    // The paper does not say how it was paid for often enough to guess, and
    // `cash` is terminal — a real card shop marked that way is excluded
    // from reconciliation forever. The reviewer sets it (ADR-042).
    settlementMode: 'unknown',
    rawRef: stored.uri,
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
    documents: [{ documentUri: stored.uri, kind: 'receipt' }],
  };

  return { purchase: { ...withoutChecksum, checksum: checksumFor(stored, withoutChecksum) } };
}
