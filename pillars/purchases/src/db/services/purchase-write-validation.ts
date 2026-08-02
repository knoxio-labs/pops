/**
 * Payload-consistency checks that run before any row is written.
 *
 * Separated from the insert path because they answer a different question:
 * not "how is this stored" but "is this payload internally coherent at
 * all". Each rejects a shape that would otherwise be recorded successfully
 * and be wrong — which is the failure mode that costs most, because nothing
 * downstream can detect it.
 */
import { InvalidIngestPayloadError } from '../errors.js';

import type { CreateChargeInput } from './purchase-input.js';
import type { IngestContext } from './purchase-write-context.js';

/**
 * Resolve a charge's value in the ORDER's currency, which is the unit the
 * residual is computed in.
 *
 * Defaulting it to the settled amount is only correct when the two
 * currencies are the same. An earlier version defaulted unconditionally on
 * the assumption that they were — an assumption nothing enforced, so an
 * adapter that set a foreign settlement currency and forgot
 * `orderAmountCents` would record AUD cents as though they were USD cents.
 * The residual is computed from this number, so the error would surface as
 * an arbitrary unexplained gap rather than as anything traceable.
 *
 * Both directions are rejected: a currency mismatch with no explicit
 * amount, and an explicit amount that contradicts a matching currency.
 */
export function resolveOrderAmount(ctx: IngestContext, input: CreateChargeInput): number {
  const settlementCurrency = input.currency ?? ctx.purchase.currency;
  const sameCurrency = settlementCurrency === ctx.purchase.currency;

  if (input.orderAmountCents === undefined) {
    if (!sameCurrency) {
      throw new InvalidIngestPayloadError(
        `charge settles in ${settlementCurrency} but the order is priced in ${ctx.purchase.currency}, so orderAmountCents is required`
      );
    }
    return input.amountCents;
  }

  if (sameCurrency && input.orderAmountCents !== input.amountCents) {
    throw new InvalidIngestPayloadError(
      `charge settles in the order's own currency (${settlementCurrency}) but orderAmountCents ${String(input.orderAmountCents)} differs from amountCents ${String(input.amountCents)}`
    );
  }
  return input.orderAmountCents;
}

/**
 * Write the per-line breakdown of a charge, after checking it is arithmetically
 * possible.
 *
 * Two ways an adapter can produce a breakdown that is silently wrong, both
 * rejected here:
 *
 * - **Over-allocation.** Allocating $60 and $50 out of a $100 charge means
 *   per-item spend sums to more than was ever paid. Under-allocation is
 *   allowed — a charge may legitimately cover only part of an order, and the
 *   unallocated remainder is visible as the difference.
 * - **Sign inversion.** A refund charge is negative, so its allocations must
 *   be too. A positive allocation against a refund would credit a line for
 *   money that came back, doubling the error in both directions.
 */

export function assertAllocationsFit(input: CreateChargeInput): void {
  const allocations = input.allocations ?? [];
  if (allocations.length === 0) return;

  const chargeSign = Math.sign(input.amountCents);
  for (const allocation of allocations) {
    const allocationSign = Math.sign(allocation.amountCents);
    if (allocationSign !== 0 && chargeSign !== 0 && allocationSign !== chargeSign) {
      throw new InvalidIngestPayloadError(
        `allocation to item ref '${allocation.itemRef}' is ${String(allocation.amountCents)} but the charge is ${String(input.amountCents)} — signs must agree`
      );
    }
  }

  const allocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  // Compared on magnitude so one branch covers charges and refunds alike.
  if (Math.abs(allocated) > Math.abs(input.amountCents)) {
    throw new InvalidIngestPayloadError(
      `allocations sum to ${String(allocated)} but the charge is only ${String(input.amountCents)}`
    );
  }
}
