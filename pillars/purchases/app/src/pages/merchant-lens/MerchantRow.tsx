import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, formatCents } from '@pops/ui';

import { explainedSplit } from './explained-split.js';
import { ExplainedSplit } from './ExplainedSplit.js';
import { merchantLabel } from './merchant-label.js';
import { MerchantOrders } from './MerchantOrders.js';

import type { ReactElement } from 'react';

import type { MerchantSpend, SpendPeriod } from './types.js';

interface Props {
  merchant: MerchantSpend;
  /**
   * The window the roll-up reported, not the one the picker currently shows.
   * The orders this row opens are read over the same window its figures were
   * computed over, or the list and the headline describe different things.
   */
  period: SpendPeriod;
}

/**
 * One merchant, one currency: the headline, the split, the figures the split
 * is made of, and the orders behind them.
 */
export function MerchantRow({ merchant, period }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const { accounting, currency } = merchant;

  return (
    <article className="space-y-2 rounded-md border p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium">{merchantLabel(merchant.merchant, t)}</h3>
          <Badge variant="outline">
            {t(`merchants.attribution.${merchant.merchant.resolution}`)}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {t('merchants.orders', { count: merchant.orderCount })}
          </span>
        </div>
        <p className="text-lg font-semibold tabular-nums">
          {formatCents(accounting.totalCents, currency)}
        </p>
      </header>

      <ExplainedSplit split={explainedSplit(accounting)} currency={currency} />

      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Figure
          label={t('merchants.figures.matched')}
          value={formatCents(accounting.matchedCents, currency)}
        />
        <Figure
          label={t('merchants.figures.awaiting')}
          value={formatCents(accounting.awaitingImportCents, currency)}
        />
        <Figure
          label={t('merchants.figures.refunded')}
          value={formatCents(accounting.refundedCents, currency)}
        />
        <Figure
          label={t('merchants.figures.netSpend')}
          value={formatCents(accounting.netSpendCents, currency)}
        />
      </dl>

      <Button
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {t(open ? 'merchants.drilldown.hide' : 'merchants.drilldown.show', {
          merchant: merchantLabel(merchant.merchant, t),
        })}
      </Button>

      {open && <MerchantOrders merchant={merchant} period={period} regionId={regionId} />}
    </article>
  );
}

function Figure({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-baseline gap-1">
      <dt>{label}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
