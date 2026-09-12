/**
 * `patchItem`, `listInventoryProposals` and `decideInventoryProposal` — the
 * inventory-proposal cluster of the `purchase.*` sub-router.
 *
 * Split from `purchase-handlers.ts` purely to keep that file under the
 * line-count cap; there is no behavioural reason for the boundary to sit
 * here rather than anywhere else in that router.
 */
import {
  confirmItemClassification,
  decideInventoryProposal,
  listInventoryProposals,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchaseItemDetailBody } from './serializers.js';

import type { z } from 'zod';

import type { InventoryProposalDecisionSchema } from '../../contract/inventory-proposals.js';
import type { PatchItemBodySchema } from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type PatchItemBody = z.infer<typeof PatchItemBodySchema>;
type ProposalDecisionBody = z.infer<typeof InventoryProposalDecisionSchema>;

/**
 * One 404 for "no such order" and "no such line on it", because
 * distinguishing them tells a caller holding a wrong order id that the line
 * exists somewhere else.
 */
function itemNotFound(purchaseId: string, itemId: string) {
  return {
    status: 404 as const,
    body: {
      message: `Item ${itemId} not found on purchase ${purchaseId}`,
      code: 'NOT_FOUND',
    },
  };
}

/**
 * The same 404, for the two routes that also reach it when the line is real
 * and the named unit is not — and, on the create route, when every slot on
 * the line has already been answered. It says only that nothing here
 * answers the request, which is true of all of them, where "item not found"
 * would be a false statement to a caller who supplied a good line and a bad
 * unit.
 */
export function proposalNotFound(purchaseId: string, itemId: string) {
  return {
    status: 404 as const,
    body: {
      message: `No inventory proposal on item ${itemId} of purchase ${purchaseId} matches this answer`,
      code: 'NOT_FOUND',
    },
  };
}

export function makePurchaseInventoryHandlers(db: PurchasesDb) {
  return {
    patchItem: async ({
      params,
      body,
    }: {
      params: { id: string; itemId: string };
      body: PatchItemBody;
    }) => {
      let detail;
      try {
        detail = confirmItemClassification(db, params.id, params.itemId, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
      if (detail === undefined) return itemNotFound(params.id, params.itemId);
      return { status: 200 as const, body: toPurchaseItemDetailBody(detail) };
    },

    listInventoryProposals: async ({ params }: { params: { id: string } }) => ({
      status: 200 as const,
      body: {
        proposals: listInventoryProposals(db, params.id).map((proposal) => ({ ...proposal })),
      },
    }),

    decideInventoryProposal: async ({
      params,
      body,
    }: {
      params: { id: string; itemId: string };
      body: ProposalDecisionBody;
    }) => {
      let unit;
      try {
        unit = decideInventoryProposal(db, params.id, params.itemId, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
      if (unit === undefined) return proposalNotFound(params.id, params.itemId);
      return { status: 200 as const, body: { unit } };
    },
  };
}
