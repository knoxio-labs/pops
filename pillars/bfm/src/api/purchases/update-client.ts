/**
 * `updatePurchase` — bfm's proxy for editing a saved purchase (POPS-2458).
 *
 * Split from `client.ts` purely to keep that file under the line-count cap;
 * it shares that file's `PillarGateway` and is merged into
 * {@link MobilePurchasesClient} there.
 *
 * A pass-through, field for field: the mobile body and `purchases`' own
 * `UpdatePurchaseBodySchema` share the same shape, so nothing is renamed or
 * recomputed on the way in — only the answer is mapped, through
 * {@link toMobilePurchaseDetail}, exactly as every other read on this leg is.
 */
import { fetchMatchedTransactions } from '../finance/matched-transactions.js';
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { matchedTransactionIds } from './bank-match-wire.js';
import { PurchasesDetailResponseSchema, toMobilePurchaseDetail } from './list-wire.js';

import type {
  MobilePurchaseDetail,
  MobileUpdatePurchaseBody,
} from '../../contract/rest-schemas.js';

export const PURCHASES_PILLAR_ID = 'purchases';

/** The subset of purchases' `purchase.*` router this call needs. */
export type PurchasesUpdateRouter = {
  purchase: {
    update: (input: { id: string } & MobileUpdatePurchaseBody) => Promise<unknown>;
  };
};

export async function updatePurchase(
  gateway: PillarGateway,
  id: string,
  body: MobileUpdatePurchaseBody
): Promise<GatewayOutcome<MobilePurchaseDetail>> {
  const outcome = await gateway.call<PurchasesUpdateRouter, unknown>(
    PURCHASES_PILLAR_ID,
    (handle) => handle.purchase.update({ id, ...body })
  );

  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesDetailResponseSchema,
    'purchase.update'
  );
  if (!isGatewayOk(answered)) return answered;

  const transactions = await fetchMatchedTransactions(
    gateway,
    matchedTransactionIds(answered.value.charges)
  );
  return { kind: 'ok', value: toMobilePurchaseDetail(answered.value, new Map(), transactions) };
}
