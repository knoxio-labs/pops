import { eq } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases } from '../schema.js';
import { type PurchasesDb } from './internal.js';
import { recomputeStatusForCharges } from './purchase-status.js';

/** Outcome of manually linking an unexplained charge. */
export type ManualLinkOutcome = 'linked' | 'charge_not_found' | 'already_linked';

/**
 * Atomically records a human-confirmed Finance link for an unlinked charge.
 *
 * The full charge amount is attributed to the chosen transaction, and the
 * confirmation timestamp makes the link survive later reconciliation sweeps.
 * Charges that are ineligible or already linked are left untouched.
 */
export function linkChargeManually(
  db: PurchasesDb,
  input: {
    chargeId: string;
    transactionUri: string;
    transactionDescription: string;
    nowIso: string;
  }
): ManualLinkOutcome {
  return db.transaction((tx) => {
    const charge = tx
      .select({
        amountCents: purchaseCharges.amountCents,
        settlementMode: purchases.settlementMode,
        status: purchases.status,
      })
      .from(purchaseCharges)
      .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId))
      .where(eq(purchaseCharges.id, input.chargeId))
      .all()[0];

    if (charge === undefined || charge.settlementMode === 'cash' || charge.status === 'ignored') {
      return 'charge_not_found';
    }

    const existing = tx
      .select({ id: purchaseChargeLinks.id })
      .from(purchaseChargeLinks)
      .where(eq(purchaseChargeLinks.chargeId, input.chargeId))
      .limit(1)
      .all()[0];
    if (existing !== undefined) return 'already_linked';

    const written = tx
      .insert(purchaseChargeLinks)
      .values({
        chargeId: input.chargeId,
        transactionUri: input.transactionUri,
        transactionDescription: input.transactionDescription,
        amountCents: charge.amountCents,
        linkType: 'manual',
        confidence: 1,
        confirmedAt: input.nowIso,
      })
      .onConflictDoNothing()
      .run().changes;
    if (written === 0) return 'already_linked';

    recomputeStatusForCharges(tx, [input.chargeId]);
    return 'linked';
  });
}
