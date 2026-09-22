/**
 * `update` — `PATCH /purchases/:id` (POPS-2458).
 *
 * Its own file rather than a case in `purchase-handlers.ts` for the same
 * reason `inventory-item-handlers.ts` is: it is the only other write in
 * this pillar that reaches another pillar mid-request, and the ORDER
 * matters. `planPurchaseUpdate` is read-only, so a rejection from it —
 * stale, locked, an inconsistent total — costs nothing. Inventory is
 * cleared next, for every line the plan would unlink, and only once every
 * one of those calls succeeds does {@link commitPurchaseUpdate} ever open a
 * transaction. A failed clear therefore leaves purchases untouched: the
 * caller's retry is safe because nothing here queues one of its own.
 */
import {
  commitPurchaseUpdate,
  InventoryLinkClearFailedError,
  inventoryUnlinkTargets,
  planPurchaseUpdate,
} from '../../db/index.js';
import { createInventoryLinkClearer, type InventoryLinkClearer } from '../inventory/client.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type { UpdatePurchaseBodySchema } from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type UpdateBody = z.infer<typeof UpdatePurchaseBodySchema>;

function notFound(id: string) {
  return {
    status: 404 as const,
    body: { message: `Purchase ${id} not found`, code: 'NOT_FOUND' },
  };
}

export function makePurchaseUpdateHandlers(
  db: PurchasesDb,
  inventory: InventoryLinkClearer = createInventoryLinkClearer()
) {
  return {
    update: async ({ params, body }: { params: { id: string }; body: UpdateBody }) => {
      let plan;
      try {
        plan = planPurchaseUpdate(db, params.id, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        throw err as Error;
      }
      if (plan === undefined) return notFound(params.id);

      for (const inventoryItemId of inventoryUnlinkTargets(plan)) {
        const result = await inventory.clear(inventoryItemId);
        if (result.kind !== 'cleared') {
          const failure = new InventoryLinkClearFailedError(`${result.kind}: ${result.reason}`);
          const mapped = tryMapServiceError(failure);
          if (mapped?.status === 502) return { status: 502 as const, body: mapped.body };
          throw failure;
        }
      }

      const detail = commitPurchaseUpdate(db, plan, body);
      return { status: 200 as const, body: toPurchaseDetailBody(detail) };
    },
  };
}
