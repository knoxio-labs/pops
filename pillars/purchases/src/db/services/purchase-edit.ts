/**
 * `updatePurchase` — editing a purchase that is already saved.
 *
 * Approved policy: on a matched, part-matched, or unrecognised-status
 * purchase, merchant, date and total are locked; everything else — lines,
 * quantities, adjustments — stays editable. Every changed field's ORIGINAL
 * value is kept in `purchase_edits`, once, the first time it changes.
 * `expectedUpdatedAt` is a compare-and-swap: a stale save is refused rather
 * than silently overwriting someone else's edit.
 *
 * The read-only half — whether an edit is even allowed, and what it would
 * do — is `purchase-edit-plan.ts`; the row-level writes are
 * `purchase-edit-records.ts` and `purchase-edit-lines.ts`. This file is
 * just the transaction that runs them in order.
 *
 * A removed line's units are deleted here (the item cascades them), which
 * is what "unlinks it" means on THIS pillar's side of an inventory-linked
 * line's removal. Clearing the OTHER pillar's own pointer back at this
 * purchase is a network call and stays out of this file entirely
 * (POPS-4268, `api/rest/purchase-update-handlers.ts`): the handler calls
 * `planPurchaseUpdate`, clears inventory for every id
 * `inventoryUnlinkTargets` names, and only then calls
 * {@link commitPurchaseUpdate} — so a failed clear refuses the whole edit
 * before this file's transaction ever opens.
 */
import { eq } from 'drizzle-orm';

import { purchases } from '../schema.js';
import { nowIso, type PurchasesDb } from './internal.js';
import { writeAddedLines, writeKeptLines, writeRemovedLines } from './purchase-edit-lines.js';
import { planPurchaseUpdate, type UpdatePlan } from './purchase-edit-plan.js';
import { recordHeaderEdits, recordLineEdits } from './purchase-edit-records.js';
import { getPurchase, type PurchaseDetail } from './purchase-reads.js';

import type { UpdatePurchaseInput } from './purchase-input.js';

export {
  inventoryUnlinkTargets,
  planPurchaseUpdate,
  type UpdatePlan,
} from './purchase-edit-plan.js';

/**
 * Write a planned edit. `plan` must come from a `planPurchaseUpdate` call
 * against the SAME purchase whose caller has not, since, allowed the row to
 * change under it — this file does not re-check staleness.
 */
export function commitPurchaseUpdate(
  db: PurchasesDb,
  plan: UpdatePlan,
  input: UpdatePurchaseInput,
  now: string = nowIso()
): PurchaseDetail {
  db.transaction((tx) => {
    recordHeaderEdits(tx, plan.purchase, input, now);
    recordLineEdits(tx, plan.purchase.id, plan, now);
    writeKeptLines(tx, plan);
    writeAddedLines(tx, plan, now);
    writeRemovedLines(tx, plan, now);

    tx.update(purchases)
      .set({
        merchantEntityId: input.merchantEntityId ?? plan.purchase.merchantEntityId,
        merchantEntityName: input.merchantEntityName ?? plan.purchase.merchantEntityName,
        orderedAt: input.orderedAt ?? plan.purchase.orderedAt,
        totalCents: input.totalCents ?? plan.purchase.totalCents,
        subtotalCents: input.subtotalCents ?? plan.purchase.subtotalCents,
        taxCents: input.taxCents ?? plan.purchase.taxCents,
        shippingCents: input.shippingCents ?? plan.purchase.shippingCents,
        discountCents: input.discountCents ?? plan.purchase.discountCents,
        surchargeCents: input.surchargeCents ?? plan.purchase.surchargeCents,
        updatedAt: now,
      })
      .where(eq(purchases.id, plan.purchase.id))
      .run();
  });

  const detail = getPurchase(db, plan.purchase.id);
  if (detail === undefined) {
    throw new Error(`commitPurchaseUpdate: purchase ${plan.purchase.id} vanished mid-edit`);
  }
  return detail;
}

/**
 * Plan and commit an edit in one call, with no inventory involvement.
 *
 * The route handler does NOT call this directly whenever a removed line
 * might carry an inventory link — see this module's header. This
 * convenience wrapper is for callers (and most of this pillar's own tests)
 * that don't need that staging: a plan with nothing to unlink behaves
 * identically either way.
 */
export function updatePurchase(
  db: PurchasesDb,
  purchaseId: string,
  input: UpdatePurchaseInput,
  now: string = nowIso()
): PurchaseDetail | undefined {
  const plan = planPurchaseUpdate(db, purchaseId, input);
  if (plan === undefined) return undefined;
  return commitPurchaseUpdate(db, plan, input, now);
}
