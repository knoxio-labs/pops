/**
 * ts-rest handler composer for the purchases pillar.
 *
 * Stitches the per-section handler factories into the typed
 * `RouterImplementation<PurchasesRestContract>` shape that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { purchasesContract } from '../../contract/rest.js';
import { makeAnalyticsHandlers } from './analytics-handlers.js';
import { makeProductHandlers } from './product-handlers.js';
import { makePurchaseHandlers } from './purchase-handlers.js';
import { makeReceiptHandlers } from './receipt-handlers.js';
import { makeReconcileHandlers, type SweepTrigger } from './reconcile-handlers.js';
import { makeSearchHandlers } from './search-handlers.js';
import { makeSourceHandlers } from './source-handlers.js';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { MerchantResolver } from '../contacts/merchant.js';

const server: ReturnType<typeof initServer> = initServer();

export function makePurchasesRestHandlers(deps: {
  purchasesDb: OpenedPurchasesDb;
  /** Fired after a successful ingest — trigger 1 of the reconciliation sweep. */
  onIngest?: () => void;
  /** Runs a sweep on demand, for `POST /reconcile/sweep`. */
  sweep?: SweepTrigger;
  /** Reads photographed receipts. Null declines every upload with a 503. */
  vision: ReceiptVision | null;
  /** Names the merchant against contacts. Injectable so tests stay offline. */
  merchant?: MerchantResolver;
}): ReturnType<typeof server.router<typeof purchasesContract>> {
  return server.router(purchasesContract, {
    analytics: makeAnalyticsHandlers(deps.purchasesDb.db),
    product: makeProductHandlers(deps.purchasesDb.db),
    purchase: makePurchaseHandlers(deps.purchasesDb.db, deps.onIngest),
    receipt: makeReceiptHandlers(deps.purchasesDb.db, deps.vision, deps.onIngest, deps.merchant),
    reconcile: makeReconcileHandlers(deps.purchasesDb.db, deps.sweep),
    search: makeSearchHandlers(deps.purchasesDb.db),
    source: makeSourceHandlers(deps.purchasesDb.db),
  });
}
