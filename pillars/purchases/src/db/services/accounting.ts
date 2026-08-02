/**
 * How much of an order's money is explained, and by what.
 *
 * A single "residual" number was not enough once charges became
 * independent of finance. There are three distinct ways an order's total
 * can fail to be fully backed by bank transactions, and collapsing them
 * loses the one piece of information the user actually acts on:
 *
 *   matched          a charge exists AND a finance transaction backs it
 *   awaitingImport   a charge exists, no transaction yet — nothing is
 *                    wrong, the statement simply has not been imported
 *   residual         no charge accounts for it at all — a gift card, a
 *                    rewards balance, or a genuine miss
 *
 * Only the third is a question for a human. Reporting the second as a
 * residual would make every recent order look broken for the weeks between
 * the purchase and the statement import, which is exactly the false alarm
 * that trains someone to ignore the number.
 */
import { isResidualBearing } from '../../contract/constants.js';

import type { PurchaseChargeLinkRow, PurchaseChargeRow } from '../schema.js';

export interface PurchaseAccounting {
  /** The order's own total, in the order's currency. */
  readonly totalCents: number;
  /** Charged and backed by at least one finance transaction. */
  readonly matchedCents: number;
  /** Charged, but no transaction has landed yet. Not a problem — a wait. */
  readonly awaitingImportCents: number;
  /**
   * `totalCents − Σ charges`. Money no charge accounts for: gift cards,
   * rewards balances, genuine misses. Never hidden, never auto-zeroed; a
   * negative value means over-charging, which is a bug worth seeing rather
   * than clamping away (ADR-042).
   */
  readonly residualCents: number;
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

  for (const charge of charges) {
    if (!isResidualBearing(charge.role)) continue;
    const hasLink = (linksByChargeId.get(charge.id) ?? []).length > 0;
    if (hasLink) matchedCents += charge.orderAmountCents;
    else awaitingImportCents += charge.orderAmountCents;
  }

  return {
    totalCents,
    matchedCents,
    awaitingImportCents,
    residualCents: totalCents - matchedCents - awaitingImportCents,
  };
}

/**
 * Landed cost of a line: what the merchant charged for it plus its share of
 * postage and of any order-level tax or discount not already inside the
 * line total.
 *
 * Derived rather than stored so it cannot drift from its parts. This is the
 * figure `inventory` wants for insurance and resale value (POPS-47) — the
 * sticker price of a thing is not what it cost to get it into the house.
 */
export function landedCostCents(item: {
  readonly lineTotalCents: number;
  readonly allocatedShippingCents: number;
  readonly allocatedAdjustmentCents: number;
}): number {
  return item.lineTotalCents + item.allocatedShippingCents + item.allocatedAdjustmentCents;
}
