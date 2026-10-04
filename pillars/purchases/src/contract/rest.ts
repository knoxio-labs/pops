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

import { purchasesAnalyticsContract } from './rest-analytics.js';
import { purchasesProductContract } from './rest-products.js';
import { purchasesPurchaseContract } from './rest-purchases.js';
import { purchasesReceiptContract } from './rest-receipts.js';
import { purchasesReconcileContract } from './rest-reconcile.js';
import { ErrorBodySchema } from './rest-schemas.js';
import { purchasesSearchContract } from './rest-search.js';
import { purchasesSourceContract } from './rest-sources.js';
import { purchasesTaggedContract } from './rest-tagged.js';

const c = initContract();

const purchasesTaggedApiContract = c.router({
  list: purchasesTaggedContract.list,
  attach: {
    ...purchasesTaggedContract.attach,
    responses: {
      ...purchasesTaggedContract.attach.responses,
      404: ErrorBodySchema,
    },
  },
  detach: {
    ...purchasesTaggedContract.detach,
    responses: {
      ...purchasesTaggedContract.detach.responses,
      404: ErrorBodySchema,
    },
  },
});

export const purchasesContract = c.router(
  {
    analytics: purchasesAnalyticsContract,
    product: purchasesProductContract,
    purchase: purchasesPurchaseContract,
    receipt: purchasesReceiptContract,
    reconcile: purchasesReconcileContract,
    search: purchasesSearchContract,
    source: purchasesSourceContract,
    tagged: purchasesTaggedApiContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type PurchasesRestContract = typeof purchasesContract;
