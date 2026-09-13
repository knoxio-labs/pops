/**
 * `createManual` — a purchase typed by hand, no receipt at all (POPS-2454).
 *
 * Split from `purchase-handlers.ts` purely to keep that file under the
 * line-count cap; there is no behavioural reason for the boundary to sit
 * here rather than anywhere else in that router.
 */
import { MANUAL_SOURCE_ID } from '../../ingest/source-ids.js';
import {
  createMerchantResolver,
  nameMerchant,
  type MerchantResolver,
} from '../contacts/merchant.js';
import { findDraftInconsistency, toCreatePurchaseInput } from './draft-mapping.js';
import { ensureDraftSource, persistDraftPurchase } from './purchase-draft-persist.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type { CreateManualPurchaseBodySchema } from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type CreateManualBody = z.infer<typeof CreateManualPurchaseBodySchema>;

/**
 * The source row a manual entry is written under, registered lazily on
 * first use — the same pattern the receipt drop-zone uses for its own
 * source. `review` rather than `auto`: a hand-typed purchase names whatever
 * merchant the reviewer typed, and nothing here has checked its settlement
 * shape (ADR-042).
 */
const MANUAL_ENTRY_SOURCE = {
  id: MANUAL_SOURCE_ID,
  label: 'Manual entries',
  descriptorPattern: null,
  autoLinkPolicy: 'review' as const,
  ingestAdapter: null,
};

export function makePurchaseManualHandlers(
  db: PurchasesDb,
  merchant: MerchantResolver = createMerchantResolver()
) {
  return {
    /**
     * `source` and `ingestMethod` are fixed to {@link MANUAL_SOURCE_ID} and
     * `'manual'` here, never read off the body — the body's shape
     * (`CreateManualPurchaseBodySchema`) does not even carry those fields,
     * so there is nothing for a caller to set wrongly.
     */
    createManual: async ({ body }: { body: CreateManualBody }) => {
      const inconsistency = findDraftInconsistency(body);
      if (inconsistency !== null) {
        return {
          status: 400 as const,
          body: { message: inconsistency.message, code: 'INCONSISTENT_TOTAL' },
        };
      }

      ensureDraftSource(db, MANUAL_ENTRY_SOURCE);
      const merchantEntityId = await nameMerchant(merchant, body.merchantEntityName);
      const input = toCreatePurchaseInput(
        { ...body, merchantEntityId },
        MANUAL_SOURCE_ID,
        'manual',
        // No photograph to key on — the reviewer's own idempotency key IS
        // this purchase's natural identity.
        body.idempotencyKey
      );

      const written = persistDraftPurchase(db, input);
      if (written.kind === 'refused') return { status: written.status, body: written.body };

      return { status: 200 as const, body: toPurchaseDetailBody(written.detail) };
    },
  };
}
