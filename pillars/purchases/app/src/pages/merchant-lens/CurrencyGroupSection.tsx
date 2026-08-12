import { useTranslation } from 'react-i18next';

import { formatCents } from '../../money.js';
import { explainedSplit } from './explained-split.js';
import { ExplainedSplit } from './ExplainedSplit.js';
import { MerchantRow } from './MerchantRow.js';

import type { ReactElement } from 'react';

import type { MerchantIdentity } from './types.js';
import type { CurrencyGroup } from './useMerchantLensModel.js';

interface Props {
  group: CurrencyGroup;
}

/**
 * One currency's merchants, under that currency's own total.
 *
 * There is no grand total across currencies and there is not meant to be: the
 * roll-up returns one per currency because no single number spans them, and
 * summing AUD into USD here would invent the figure the contract refused to.
 */
export function CurrencyGroupSection({ group }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const { currency, total } = group;

  return (
    <section className="space-y-3" aria-labelledby={`merchant-currency-${currency}`}>
      <div className="space-y-1.5 border-b pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={`merchant-currency-${currency}`} className="text-sm font-semibold uppercase">
            {currency}
          </h2>
          {total !== null && (
            <p className="text-muted-foreground text-xs">
              {t('merchants.orders', { count: total.orderCount })}
            </p>
          )}
        </div>

        {total === null ? (
          <p className="text-warning text-xs">{t('merchants.currency.noTotal')}</p>
        ) : (
          <>
            <p className="text-xl font-semibold tabular-nums">
              {formatCents(total.accounting.totalCents, currency)}
            </p>
            <ExplainedSplit split={explainedSplit(total.accounting)} currency={currency} />
          </>
        )}
      </div>

      <ul className="space-y-3" aria-label={t('merchants.list.ariaLabel', { currency })}>
        {group.merchants.map((merchant) => (
          <li key={merchantKey(merchant.merchant)}>
            <MerchantRow merchant={merchant} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function merchantKey(identity: MerchantIdentity): string {
  return `${identity.resolution}:${identity.entityId ?? identity.name ?? ''}`;
}
