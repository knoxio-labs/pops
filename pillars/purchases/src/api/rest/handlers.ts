/**
 * ts-rest handler composer for the purchases pillar.
 *
 * Stitches the per-section handler factories into the typed
 * `RouterImplementation<PurchasesRestContract>` shape that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { purchasesContract } from '../../contract/rest.js';
import { makePurchaseHandlers } from './purchase-handlers.js';
import { makeSourceHandlers } from './source-handlers.js';

import type { OpenedPurchasesDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

export function makePurchasesRestHandlers(deps: {
  purchasesDb: OpenedPurchasesDb;
  /** Fired after a successful ingest — trigger 1 of the reconciliation sweep. */
  onIngest?: () => void;
}): ReturnType<typeof server.router<typeof purchasesContract>> {
  return server.router(purchasesContract, {
    purchase: makePurchaseHandlers(deps.purchasesDb.db, deps.onIngest),
    source: makeSourceHandlers(deps.purchasesDb.db),
  });
}
