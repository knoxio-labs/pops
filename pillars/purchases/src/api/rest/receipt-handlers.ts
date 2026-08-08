/**
 * Handlers for the `receipt.*` sub-router.
 *
 * The order of operations is deliberate: **store the photograph first**,
 * then read it. If the model is down, or reads it wrongly, or the figures
 * disagree, the image is still on disk and addressable — so a failed upload
 * leaves evidence rather than nothing. Reading first and storing only on
 * success would discard exactly the receipts a human needs to look at.
 */
import {
  createPurchase,
  findPurchaseAtInstantForAmount,
  findPurchaseBySourceOrderId,
  getPurchase,
  upsertSource,
} from '../../db/index.js';
import {
  DATE_UNCERTAIN,
  RECEIPT_SOURCE_ID,
  receiptToPurchase,
} from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import { canonicalBase64, looksLikeImage, storeReceiptImage } from '../../ingest/receipt/store.js';
import { createMerchantResolver, type MerchantResolver } from '../contacts/merchant.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type {
  ReceiptOutcomeSchema,
  UploadReceiptBodySchema,
} from '../../contract/rest-receipts.js';
import type { PurchaseDetail, PurchasesDb } from '../../db/index.js';
import type { CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { ErrorBody } from './error-mapping.js';

type UploadBody = z.infer<typeof UploadReceiptBodySchema>;
/**
 * The contract's own union. Annotating each branch against it is what makes
 * a body that drifts from the declared shape a compile error rather than a
 * response nobody validates.
 */
type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>;

const ok = (body: ReceiptOutcome) => ({ status: 200 as const, body });

/**
 * Two refusals worth making before spending a model call.
 *
 * Both are answers the user can act on immediately — "configure a key",
 * "that is not a JPEG" — where the same facts discovered inside the model
 * come back as confusion that costs money to obtain.
 */
const visionUnavailable = () => ({
  status: 503 as const,
  body: {
    message:
      'No vision model is configured; set ANTHROPIC_API_KEY, or ' +
      'ANTHROPIC_API_KEY_FILE pointing at a mounted secret, to accept receipts',
    code: 'VISION_UNAVAILABLE',
  },
});

const notAnImage = (mediaType: string) => ({
  status: 400 as const,
  body: {
    message: `The upload is not a valid ${mediaType} file`,
    code: 'NOT_AN_IMAGE',
  },
});

/**
 * Trigger 1 of the reconciliation sweep, fired only after the write
 * committed and swallowed if it fails. Letting a scheduling failure turn a
 * successful ingest into a 500 would make the caller re-upload a receipt
 * that is already stored.
 */
function fireIngest(onIngest: () => void): void {
  try {
    onIngest();
  } catch (error) {
    console.error('[purchases-api] ingest sweep trigger failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
    label: 'Photographed receipts',
    descriptorPattern: null,
    autoLinkPolicy: 'review',
    ingestAdapter: 'receipt-vision',
  });
}

/**
 * Best-effort merchant link.
 *
 * The guarantee that a contacts outage costs a link rather than the
 * purchase belongs HERE, not inside whichever resolver happens to be
 * wired in. The live one catches its own failures; a future one, or a
 * stub, might not, and a receipt must not be lost to a peer being down.
 */
async function nameMerchant(
  merchant: MerchantResolver,
  merchantName: string | null | undefined
): Promise<string | null> {
  if (merchantName === null || merchantName === undefined) return null;
  try {
    return await merchant.resolve(merchantName);
  } catch (error) {
    console.warn('[purchases-api] merchant lookup failed; leaving the purchase unlinked', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
 * Has this shop already been recorded from a different photograph?
 *
 * Only asked when the receipt stated its own date. An inferred date is the
 * moment of upload, which differs between two uploads of the same paper —
 * so it would never match, and matching on it would be wrong anyway, since
 * two undated receipts uploaded in the same second are not one receipt.
 */
function sameShopAlreadyRecorded(
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

function persist(db: PurchasesDb, input: CreatePurchaseInput): Persisted {
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

export function makeReceiptHandlers(
  db: PurchasesDb,
  /** Null when no API key is configured — every upload is then declined. */
  vision: ReceiptVision | null,
  onIngest: () => void = () => undefined,
  merchant: MerchantResolver = createMerchantResolver()
) {
  return {
    upload: async ({ body }: { body: UploadBody }) => {
      // Stamped before the model, not after. An undated receipt is dated
      // from its upload, and a vision call takes seconds — enough to carry
      // a shop uploaded at 23:59 into the following day.
      const uploadedAt = new Date().toISOString();
      if (vision === null) return visionUnavailable();
      const dataBase64 = canonicalBase64(body.dataBase64);
      if (!looksLikeImage(dataBase64, body.mediaType)) return notAnImage(body.mediaType);

      const image = { mediaType: body.mediaType, dataBase64 };
      const stored = storeReceiptImage(image);

      // Before the model, not after. The photograph's hash IS the key, so a
      // re-upload is already knowable here — and letting it reach the vision
      // call means paying for an answer whose only possible outcome is 409.
      // Re-photographing a receipt you already sent is an ordinary mistake,
      // and it should be free.
      const existing = findPurchaseBySourceOrderId(db, RECEIPT_SOURCE_ID, stored.sha256);
      if (existing !== undefined) {
        return {
          status: 409 as const,
          body: {
            message: `This photograph has already been read as purchase ${existing.id}`,
            code: 'ALREADY_IMPORTED',
          },
        };
      }

      const outcome = await readReceipt(vision, image);

      if (outcome.kind === 'unreadable') {
        return ok({ kind: 'unreadable', receiptUri: stored.uri, reason: outcome.reason });
      }

      if (outcome.kind === 'needs-review') {
        return ok({
          kind: 'needs-review',
          receiptUri: stored.uri,
          failures: [...outcome.gate.failures],
          extracted: outcome.extracted,
        });
      }

      // Always maps: a receipt with no readable date is dated from its
      // upload and tagged, rather than refused. The shop happened and the
      // photograph exists, so losing it would be worse than carrying an
      // inferred date the tag stops anyone mistaking for a stated one.
      const shaped = receiptToPurchase(outcome.extracted, outcome.gate, stored, uploadedAt);

      const alreadyHave = sameShopAlreadyRecorded(db, shaped.purchase);
      if (alreadyHave !== undefined) {
        return {
          status: 409 as const,
          body: {
            message:
              `This looks like purchase ${alreadyHave.id}, already recorded from ` +
              'another photograph of the same receipt',
            code: 'ALREADY_IMPORTED',
          },
        };
      }

      // Best-effort, and deliberately after the reading rather than part of
      // it: the entity link is something this fleet knows, not something
      // the receipt said, so it is not in the checksum and a contacts
      // outage costs a link rather than the purchase.
      const merchantEntityId = await nameMerchant(merchant, shaped.purchase.merchantEntityName);

      const written = persist(db, { ...shaped.purchase, merchantEntityId });
      if (written.kind === 'refused') return { status: written.status, body: written.body };

      fireIngest(onIngest);
      return ok({
        kind: 'created',
        purchase: toPurchaseDetailBody(written.detail),
        alreadyStored: stored.alreadyPresent,
      });
    },
  };
}
