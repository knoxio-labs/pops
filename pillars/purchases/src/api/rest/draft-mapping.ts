import type { z } from 'zod';

import type { IngestMethod } from '../../contract/constants.js';
/**
 * Turning a reviewed draft body into a `CreatePurchaseInput`, and checking
 * it is internally consistent before it is ever handed to `createPurchase`.
 *
 * Shared by saving a corrected receipt-derived draft and creating a manual
 * purchase (POPS-2454) — the two differ only in `source` and `ingestMethod`,
 * which the caller supplies and the phone never gets to choose.
 */
import type {
  CreateManualPurchaseBodySchema,
  SaveReceiptDraftBodySchema,
} from '../../contract/rest-schemas.js';
import type { CreatePurchaseInput } from '../../db/services/purchase-input.js';

export type DraftBody =
  | z.infer<typeof CreateManualPurchaseBodySchema>
  | z.infer<typeof SaveReceiptDraftBodySchema>;

/**
 * Fix the provenance the handler decided and drop the wire-only
 * `idempotencyKey`, which becomes `checksum` — a repeat refuses the SAVE
 * REQUEST as a retry.
 *
 * `sourceOrderId` is a separate concern the caller supplies explicitly: for
 * a manual entry there is no content to key on, so it is ordinarily the same
 * idempotency key, but for a receipt-derived save it is the receipt's own
 * content key (`receiptKeyFromUris`) — the identity of the PHOTOGRAPH, which
 * outlives any one save request and must refuse a second save of the same
 * receipt under a fresh key.
 */
export function toCreatePurchaseInput(
  body: DraftBody,
  source: string,
  ingestMethod: IngestMethod,
  sourceOrderId: string
): CreatePurchaseInput {
  const { idempotencyKey, ...fields } = body;
  return {
    ...fields,
    source,
    ingestMethod,
    sourceOrderId,
    checksum: idempotencyKey,
  };
}

export interface DraftInconsistency {
  readonly message: string;
}

/**
 * Whether the lines and adjustments the reviewer typed actually add up to
 * the total they typed.
 *
 * Exact, no tolerance — the same posture the receipt gate takes (`gate.ts`),
 * and for the same reason: a reviewer correcting a figure by hand is a
 * moment where a transcription slip is exactly as likely as it was in the
 * original photograph, and a tolerance wide enough to absorb one hides it.
 */
export function findDraftInconsistency(body: DraftBody): DraftInconsistency | null {
  const lineTotalCents = body.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const computed =
    lineTotalCents -
    (body.discountCents ?? 0) +
    (body.surchargeCents ?? 0) +
    (body.shippingCents ?? 0) +
    (body.taxCents ?? 0);
  if (computed !== body.totalCents) {
    return {
      message:
        `The lines and adjustments sum to ${String(computed)} cents, which does not match ` +
        `the stated total of ${String(body.totalCents)} cents`,
    };
  }
  return null;
}
