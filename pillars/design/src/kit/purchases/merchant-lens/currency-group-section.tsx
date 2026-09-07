import { merchantOrderKey } from '@/fixtures/purchases-merchant-orders';
import { merchantKey } from '@/fixtures/purchases-merchant-spend';

import { formatCents } from '@pops/ui';

import { explainedSplit } from './explained-split';
import { ExplainedSplitView } from './explained-split-view';
import { MerchantRow } from './merchant-row';
import { orderCountLabel } from './order-count-agreement';

import type { MerchantOrder } from '@/fixtures/purchases-merchant-orders';
import type { CurrencyGroup } from '@/fixtures/purchases-merchant-spend';

/**
 * One currency's merchants, under that currency's own total.
 *
 * There is no grand total across currencies and there is not meant to be:
 * the roll-up returns one per currency because no single number spans them,
 * and summing AUD into USD here would invent the figure the contract
 * refused to.
 */
export function CurrencyGroupSection({
  group,
  ordersByMerchant,
}: {
  group: CurrencyGroup;
  ordersByMerchant: Record<string, MerchantOrder[]>;
}) {
  const { currency, total } = group;

  return (
    <section className="space-y-3" aria-labelledby={`merchant-currency-${currency}`}>
      <div className="space-y-1.5 border-b pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={`merchant-currency-${currency}`} className="text-sm font-semibold uppercase">
            {currency}
          </h2>
          {total !== null && (
            <p className="text-muted-foreground text-xs">{orderCountLabel(total.orderCount)}</p>
          )}
        </div>

        {total === null ? (
          <p className="text-warning text-xs">
            The roll-up gave no total for this currency. The merchants below are still its own
            figures, so they are shown rather than dropped.
          </p>
        ) : (
          <>
            <p className="text-xl font-semibold tabular-nums">
              {formatCents(total.accounting.totalCents, currency)}
            </p>
            <ExplainedSplitView split={explainedSplit(total.accounting)} currency={currency} />
          </>
        )}
      </div>

      <ul className="space-y-3" aria-label={`Merchants paid in ${currency}`}>
        {group.merchants.map((merchant) => (
          <li key={merchantKey(merchant.merchant)}>
            <MerchantRow
              merchant={merchant}
              orders={ordersByMerchant[merchantOrderKey(merchant)] ?? []}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
