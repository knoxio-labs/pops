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

import { instantFromLocalParts } from '../local-time.js';
import { parseAmountCents } from '../money.js';

import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ExtractedReceipt } from './extraction.js';
import type { GateResult } from './gate.js';
import type { StoredReceipt } from './store.js';

export const RECEIPT_SOURCE_ID = 'receipt';

/**
 * When the receipt prints a date but no time.
 *
 * Midday, not midnight. The zone is a configured guess (`../local-time.ts`)
 * and midnight sits against a day boundary, so any error in that guess
 * moves the purchase to the adjacent day — and the reconciliation window is
 * measured in days. Midday is the reading furthest from being wrong about
 * which day it was.
 */
const ASSUMED_HOUR = 12;

const DEFAULT_CURRENCY = 'AUD';

export type ReceiptPurchaseResult =
  | { readonly kind: 'mapped'; readonly purchase: CreatePurchaseInput }
  | { readonly kind: 'undatable'; readonly reason: string };

function toItem(line: ExtractedReceipt['lines'][number]): CreateItemInput | null {
  const lineTotalCents = parseAmountCents(line.amount);
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

function occurredAt(extracted: ExtractedReceipt): string | null {
  if (extracted.purchasedOn === null) return null;
  const [year, month, day] = extracted.purchasedOn.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;

  const [hour, minute] =
    extracted.purchasedAt === null
      ? [ASSUMED_HOUR, 0]
      : extracted.purchasedAt.split(':').map(Number);

  return instantFromLocalParts({
    year,
    month,
    day,
    hour: hour ?? ASSUMED_HOUR,
    minute: minute ?? 0,
  });
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
 * Refuses only one thing: a receipt with no readable date. `orderedAt` is
 * what the reconciliation window is measured against, so a purchase without
 * one can never match a transaction and can never be told apart from one
 * that simply has not settled yet. Dating it from the upload instead would
 * be a fabrication that looks exactly like a fact.
 */
export function receiptToPurchase(
  extracted: ExtractedReceipt,
  gate: GateResult,
  stored: StoredReceipt
): ReceiptPurchaseResult {
  const orderedAt = occurredAt(extracted);
  if (orderedAt === null) {
    return {
      kind: 'undatable',
      reason:
        extracted.purchasedOn === null
          ? 'the receipt states no date, and a purchase without one can never match a transaction'
          : `"${extracted.purchasedOn}" is not a real date`,
    };
  }

  const items = extracted.lines
    .map(toItem)
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

  return {
    kind: 'mapped',
    purchase: { ...withoutChecksum, checksum: checksumFor(stored, withoutChecksum) },
  };
}
