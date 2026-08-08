/**
 * REST contract for the purchases pillar — ts-rest single source of truth.
 *
 * `generateOpenApi(purchasesContract, …)` projects this to
 * `openapi/purchases.openapi.json`; `openapi-typescript` then projects the
 * JSON to `src/contract/api-types.generated.ts`. Polyglot consumers skip
 * the TS file and generate their own off the JSON.
 *
 * Lego principle: this is the ONLY description of the purchases wire
 * format. Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { purchasesPurchaseContract } from './rest-purchases.js';
import { purchasesReceiptContract } from './rest-receipts.js';
import { purchasesReconcileContract } from './rest-reconcile.js';
import { purchasesSourceContract } from './rest-sources.js';

const c = initContract();

export const purchasesContract = c.router(
  {
    purchase: purchasesPurchaseContract,
    receipt: purchasesReceiptContract,
    reconcile: purchasesReconcileContract,
    source: purchasesSourceContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type PurchasesRestContract = typeof purchasesContract;
