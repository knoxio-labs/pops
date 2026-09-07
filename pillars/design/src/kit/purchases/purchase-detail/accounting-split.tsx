import { Fact } from '@/kit/purchases/fact';

import { formatCents } from '@pops/ui';

import type { OrderAccounting } from '@/fixtures/purchases-order-types';

const NOT_RECORDED = 'Not recorded';

/**
 * What of this order is accounted for, and what is not.
 *
 * `residualCents` is rendered verbatim even when it is zero: a residual that
 * disappears when it is nil makes its absence mean both "all accounted for"
 * and "this view does not show that", and a reader cannot tell those apart.
 * Nothing here is recomputed from the other figures.
 */
export function AccountingSplit({
  accounting,
  currency,
}: {
  accounting: OrderAccounting;
  currency: string;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="purchase-accounting">
      <Fact
        label="Order total"
        value={formatCents(accounting.totalCents, currency)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Matched"
        value={formatCents(accounting.matchedCents, currency)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Awaiting import"
        value={formatCents(accounting.awaitingImportCents, currency)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Unexplained"
        value={formatCents(accounting.residualCents, currency)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Refunded"
        value={formatCents(accounting.refundedCents, currency)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Net spend"
        value={formatCents(accounting.netSpendCents, currency)}
        missingLabel={NOT_RECORDED}
      />
    </dl>
  );
}
