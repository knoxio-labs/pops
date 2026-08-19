/**
 * Turning parsed refunds into the charges an order is created with.
 *
 * Split from `order-history.ts` so the shaping decisions — what a refund
 * charge is allowed to claim, and what happens to one that cannot be
 * attached — sit together rather than inside the order assembly.
 */
import { type AmazonAnomaly } from './columns.js';

import type { CreateChargeInput } from '../../db/services/purchase-input.js';

/**
 * What both halves of the bundle produce once their own file's grain has
 * been resolved: an order, a positive magnitude, a currency and the instant
 * the money moved.
 *
 * Declared here rather than imported from either parser so the physical and
 * digital adapters share one set of shaping rules — the decisions below are
 * about what a refund charge may claim, and those do not differ by file.
 */
export interface SourceRefund {
  readonly sourceOrderId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly refundedAt: string;
}

/**
 * Turn an order's refunds into charges.
 *
 * A refund is the only charge this adapter emits: the export publishes no
 * per-charge breakdown of what was *paid*, so a refunded order lands with
 * one negative charge and its full total still residual until the next
 * sweep mints the `derived` capture the export omits. That reads oddly and
 * is right — `computeAccounting` keeps refunds out of the residual entirely
 * (ADR-042), so this can never make the "something is wrong" number go up.
 *
 * A refund is deliberately not enough to make an order look accounted for:
 * the minting predicate ignores this role, so a refunded order is minted a
 * capture just as an un-refunded one is.
 *
 * No allocations, and `purchase_items.refundedCents` is left alone. The
 * disbursement feed names an order and never a line, and spreading an
 * order-level refund across lines pro rata would be a guess presented as a
 * measurement.
 *
 * `sourceChargeRef` stays null on purpose: that column holds the merchant's
 * own identifier for a charge, and Amazon publishes none for a refund.
 * Minting a synthetic one would make an invented key indistinguishable
 * from a real one for every consumer that reads the column.
 */
export function buildRefundCharges(
  sourceOrderId: string,
  orderCurrency: string,
  refunds: readonly SourceRefund[],
  anomalies: AmazonAnomaly[]
): CreateChargeInput[] {
  const charges: CreateChargeInput[] = [];

  for (const refund of refunds) {
    // `orderAmountCents` is the unit the residual and `refundedCents` are
    // computed in, and the bundle carries no FX rate to convert into it.
    // Recording the settlement figure as if it were the order figure would
    // silently misstate what came back, so a mismatch is reported instead.
    if (refund.currency !== orderCurrency) {
      anomalies.push({
        kind: 'refund-currency-mismatch',
        sourceOrderId,
        detail:
          `refund of ${String(refund.amountCents)}c is stated in ${refund.currency} but the ` +
          `order is in ${orderCurrency}, and the bundle carries no rate to convert it`,
      });
      continue;
    }

    charges.push({
      sourceChargeRef: null,
      amountCents: -refund.amountCents,
      currency: refund.currency,
      orderAmountCents: -refund.amountCents,
      chargedAt: refund.refundedAt,
      role: 'refund',
      origin: 'merchant',
    });
  }

  return charges;
}

/**
 * Report every refund whose order did not come out of the history.
 *
 * A refund with nowhere to land is the one failure mode that looks like
 * success: the order simply reports its full total as spent, exactly as an
 * order that was never refunded does. In the reference bundle all 16
 * refunds join, so any orphan here means the two files came from different
 * downloads, or that the order was dropped for an unreadable date.
 */
export function reportOrphanRefunds(
  refundsByOrderId: ReadonlyMap<string, readonly SourceRefund[]>,
  builtOrderIds: ReadonlySet<string>,
  sourceFilename: string,
  anomalies: AmazonAnomaly[]
): void {
  for (const [sourceOrderId, orderRefunds] of refundsByOrderId) {
    if (builtOrderIds.has(sourceOrderId)) continue;
    for (const refund of orderRefunds) {
      anomalies.push({
        kind: 'orphan-refund',
        sourceOrderId,
        detail:
          `refund of ${String(refund.amountCents)}c ${refund.currency} names an order that ` +
          `${sourceFilename} did not yield, so the money could not be attached`,
      });
    }
  }
}
