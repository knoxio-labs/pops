/**
 * Handlers for the `receipt.*` sub-router.
 *
 * The order of operations is deliberate: **store the photograph first**,
 * then read it. If the model is down, or reads it wrongly, or the figures
 * disagree, the image is still on disk and addressable — so a failed upload
 * leaves evidence rather than nothing. Reading first and storing only on
 * success would discard exactly the receipts a human needs to look at.
 */
import { createPurchase, getPurchase, upsertSource } from '../../db/index.js';
import { RECEIPT_SOURCE_ID, receiptToPurchase } from '../../ingest/receipt/purchase.js';
import { readReceipt } from '../../ingest/receipt/read-receipt.js';
import { looksLikeImage, storeReceiptImage } from '../../ingest/receipt/store.js';
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
    message: 'No vision model is configured; set ANTHROPIC_API_KEY to accept receipts',
    code: 'VISION_UNAVAILABLE',
  },
});

const notAnImage = (mediaType: string) => ({
  status: 400 as const,
  body: { message: `The upload is not a ${mediaType}`, code: 'NOT_AN_IMAGE' },
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
 * Write the purchase and read it back, or map the refusal.
 *
 * A duplicate is the ordinary answer to re-uploading a photograph rather
 * than a failure — and the image itself was already deduplicated on disk
 * long before this point.
 */
type Persisted =
  | { readonly kind: 'written'; readonly detail: PurchaseDetail }
  | { readonly kind: 'refused'; readonly status: 400 | 409; readonly body: ErrorBody };

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
  onIngest: () => void = () => undefined
) {
  return {
    upload: async ({ body }: { body: UploadBody }) => {
      if (vision === null) return visionUnavailable();
      if (!looksLikeImage(body.dataBase64, body.mediaType)) return notAnImage(body.mediaType);

      const image = { mediaType: body.mediaType, dataBase64: body.dataBase64 };
      const stored = storeReceiptImage(image);
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
      const shaped = receiptToPurchase(outcome.extracted, outcome.gate, stored);

      const written = persist(db, shaped.purchase);
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
