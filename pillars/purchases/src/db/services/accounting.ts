/**
 * How much of an order's money is explained, and by what.
 *
 * A single "residual" number was not enough once charges became independent
 * of finance, and folding refunds into it was worse than not enough — it
 * was wrong. There are three distinct ways an order's total can fail to be
 * backed by bank transactions, plus one way money can come back, and each
 * calls for something different:
 *
 *   matched          a charge exists AND a transaction backs it
 *   awaitingImport   a charge exists, no transaction yet — nothing is
 *                    wrong, the statement simply has not been imported
 *   residual         no charge accounts for it — a gift card, a rewards
 *                    balance, or a genuine miss
 *   refunded         money returned. Not a payment, and deliberately NOT
 *                    subtracted from the three above
 *
 * Only `residual` is a question for a human. Reporting `awaitingImport` as
 * a residual would make every recent order look broken for the weeks
 * between the purchase and the statement import — the false alarm that
 * teaches someone to ignore the number.
 *
 * **Why refunds are their own bucket.** An earlier version summed refunds
 * into the same total as captures, so a $56.78 order fully paid and then
 * $11.79 refunded reported a residual of $11.79 — presenting returned money
 * as unexplained money. Getting a refund made the "something is wrong"
 * number go *up*. A consumer would have to special-case that to render
 * anything truthful, which is precisely the kind of leak that makes a
 * frontend hard to build on top of a backend that is almost right.
 *
 * The identity a consumer can rely on:
 *
 *   totalCents === matchedCents + awaitingImportCents + residualCents
 *
 * with `refundedCents` orthogonal to it, and `netSpendCents` the derived
 * headline figure — exposed here rather than left to each consumer, because
 * three frontends computing it independently is three chances to disagree.
 *
 * **What the headline figure answers.** `netSpendCents` is `totalCents −
 * refundedCents`: the merchant's own statement of what the order cost, less
 * what came back. It deliberately does not consult the three buckets, which
 * answer the separate question of how much of that cost can be proven
 * through the bank. Deriving it from `matched + awaitingImport` instead made
 * the figure a function of import and sweep history — $0 for an order whose
 * capture had not been minted yet, its full total minutes later, with
 * nothing about the spend having changed — and it dropped gift-card and
 * rewards money that ADR-042 counts as spend. Summed for a merchant it is
 * `Σtotal − Σrefunded`, additive and stable, whereas the old form moved
 * under the aggregate every time a cron ran.
 */
import { isResidualBearing } from '../../contract/constants.js';

import type { PurchaseChargeLinkRow, PurchaseChargeRow } from '../schema.js';

export interface PurchaseAccounting {
  /** The order's own total, in the order's currency. */
  readonly totalCents: number;
  /** Charged and backed by at least one finance transaction. Refunds excluded. */
  readonly matchedCents: number;
  /** Charged, but no transaction has landed yet. Not a problem — a wait. */
  readonly awaitingImportCents: number;
  /**
   * `totalCents − matched − awaitingImport`. Money no charge accounts for:
   * gift cards, rewards balances, genuine misses. Never hidden, never
   * auto-zeroed; a negative value means over-charging, which is a bug worth
   * seeing rather than clamping away (ADR-042).
   */
  readonly residualCents: number;
  /** Magnitude of money returned. Positive. Orthogonal to the identity above. */
  readonly refundedCents: number;
  /**
   * `totalCents − refundedCents`. What the order actually cost, independent
   * of how much of it can be proven through the bank. Never clamped: negative
   * means refunds exceeded the order total, a genuine over-refund worth
   * seeing rather than hiding (ADR-042).
   */
  readonly netSpendCents: number;
}

/**
 * Compute an order's accounting split.
 *
 * `authorization` charges are excluded throughout: a card hold and its
 * later capture are two records of one payment, and counting both would
 * make a correctly-settled order look doubly paid.
 */
export function computeAccounting(
  totalCents: number,
  charges: readonly PurchaseChargeRow[],
  linksByChargeId: ReadonlyMap<string, readonly PurchaseChargeLinkRow[]>
): PurchaseAccounting {
  let matchedCents = 0;
  let awaitingImportCents = 0;
  let refundedCents = 0;

  for (const charge of charges) {
    if (!isResidualBearing(charge.role)) continue;

    if (charge.role === 'refund') {
      // Magnitude, so the figure reads as "returned" rather than as a
      // negative payment. A refund recorded with a positive amount is an
      // adapter bug, but abs() keeps one from flipping the sign of the
      // whole bucket.
      refundedCents += Math.abs(charge.orderAmountCents);
      continue;
    }

    const hasLink = (linksByChargeId.get(charge.id) ?? []).length > 0;
    if (hasLink) matchedCents += charge.orderAmountCents;
    else awaitingImportCents += charge.orderAmountCents;
  }

  return {
    totalCents,
    matchedCents,
    awaitingImportCents,
    residualCents: totalCents - matchedCents - awaitingImportCents,
    refundedCents,
    netSpendCents: totalCents - refundedCents,
  };
}

/**
 * Landed cost of a line: what the merchant charged for it plus its share of
 * postage and of any order-level tax or discount not already inside the
 * line total.
 *
 * Derived rather than stored so it cannot drift from its parts. This is the
 * figure `inventory` wants for insurance and resale value — the sticker
 * price of a thing is not what it cost to get it into the house.
 */
export function landedCostCents(item: {
  readonly lineTotalCents: number;
  readonly allocatedShippingCents: number;
  readonly allocatedAdjustmentCents: number;
}): number {
  return item.lineTotalCents + item.allocatedShippingCents + item.allocatedAdjustmentCents;
}
