import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { formatCents } from '../../money.js';
import { explainedSplit } from './explained-split.js';
import { ExplainedSplit } from './ExplainedSplit.js';

import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';

import type { MerchantIdentity, MerchantSpend } from './types.js';

interface Props {
  merchant: MerchantSpend;
}

/**
 * One merchant, one currency: the headline, the split, and the figures the
 * split is made of.
 */
export function MerchantRow({ merchant }: Props): ReactElement {
  const { t } = useTranslation('purchases');
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

/**
 * An entity group is not obliged to carry a label, so falling back to its id
 * keeps the row identifiable instead of blank — and keeps it distinguishable
 * from the unattributed group, which is a different statement entirely.
 */
function merchantLabel(identity: MerchantIdentity, t: TFunction<'purchases'>): string {
  switch (identity.resolution) {
    case 'entity':
      return identity.name ?? t('merchants.unnamedEntity', { entityId: identity.entityId });
    case 'name':
      return identity.name;
    case 'unattributed':
      return t('merchants.unattributed');
  }
}
