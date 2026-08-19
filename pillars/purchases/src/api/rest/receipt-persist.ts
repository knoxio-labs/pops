/**
 * Writing a read receipt, and refusing one this pillar already holds.
 *
 * Split from the handler so the route reads as the decisions it makes —
 * store, refuse, read, shape, write — rather than as the mechanics of any
 * one of them.
 */
import {
  createPurchase,
  findPurchaseAtInstantForAmount,
  getPurchase,
  upsertSource,
} from '../../db/index.js';
import { DATE_UNCERTAIN, RECEIPT_SOURCE_ID } from '../../ingest/receipt/purchase.js';
import { tryMapServiceError } from './error-mapping.js';

import type { PurchaseDetail, PurchasesDb } from '../../db/index.js';
import type { CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ErrorBody } from './error-mapping.js';

/**
 * Register the drop-zone's own source, on first use.
 *
 * Sources are rows, not a compiled enum (ADR-035), and every other one is
 * registered by whoever ingests through it — the Amazon and Woolworths
 * CLIs upsert theirs before backfilling. The drop-zone has no CLI, so it
 * does the same thing, lazily: an upload works the moment an API key
 * appears rather than after someone remembers to `PUT /sources/receipt`.
 *
 * On use rather than at construction, because a source is a destination
 * that exists — and one nothing has ever uploaded to does not. Registering
 * at boot also made `GET /sources` non-empty for every deployment, drop-zone
 * or not, which is a claim about the pillar that was not true.
 *
 * No descriptor pattern: the merchant differs per photograph, so these
 * reconcile on amount and date rather than on a bank descriptor. `review`
 * rather than `auto` for the same reason — there is no single merchant
 * whose settlement shape can be trusted in advance (ADR-042).
 */
function ensureReceiptSource(db: PurchasesDb): void {
  upsertSource(db, {
    id: RECEIPT_SOURCE_ID,
    label: 'Uploaded receipts',
    descriptorPattern: null,
    autoLinkPolicy: 'review',
    ingestAdapter: 'receipt-vision',
  });
}

/**
 * Write the purchase and read it back, or map the refusal.
 *
 * A duplicate is the ordinary answer to re-uploading a photograph rather
 * than a failure — and the image itself was already deduplicated on disk
 * long before this point.
 */
type Persisted =
  | { readonly kind: 'written'; readonly detail: PurchaseDetail }
  | { readonly kind: 'refused'; readonly status: 400 | 409; readonly body: ErrorBody };

/**
 * Has this shop already been recorded from a different file?
 *
 * The content-addressed key catches the same bytes sent twice. This catches
 * what people actually do: photograph the same paper twice, or photograph a
 * receipt and later upload the merchant's PDF of it. Those are different
 * bytes and therefore different keys, and only the receipt's own stated
 * instant and amount can recognise them as one shop.
 *
 * Only asked when the receipt stated its own date. An inferred date is the
 * moment of upload, which differs between two uploads of the same receipt —
 * so it would never match, and matching on it would be wrong anyway, since
 * two undated receipts uploaded in the same second are not one receipt.
 */
export function sameShopAlreadyRecorded(
  db: PurchasesDb,
  purchase: CreatePurchaseInput
): { id: string } | undefined {
  if (purchase.tags?.includes(DATE_UNCERTAIN) === true) return undefined;
  return findPurchaseAtInstantForAmount(db, {
    source: RECEIPT_SOURCE_ID,
    orderedAt: purchase.orderedAt,
    totalCents: purchase.totalCents,
    currency: purchase.currency,
  });
}

export function persistReceiptPurchase(db: PurchasesDb, input: CreatePurchaseInput): Persisted {
  ensureReceiptSource(db);

  let id: string;
  try {
    id = createPurchase(db, input);
  } catch (error) {
    const mapped = tryMapServiceError(error);
    if (mapped?.status === 409) return { kind: 'refused', status: 409, body: mapped.body };
    // A missing source is a deployment gap rather than a bad photograph;
    // either way the caller cannot fix it by retrying.
    if (mapped?.status === 400 || mapped?.status === 404) {
      return { kind: 'refused', status: 400, body: mapped.body };
    }
    throw error;
  }

  const detail = getPurchase(db, id);
  if (detail === undefined) {
    throw new Error(`createPurchase returned id ${id} but it could not be read back`);
  }
  return { kind: 'written', detail };
}
