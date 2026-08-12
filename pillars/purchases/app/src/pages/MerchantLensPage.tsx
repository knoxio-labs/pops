import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, PageHeader, formatDate } from '@pops/ui';

import { AbsentDrillDown } from './merchant-lens/AbsentDrillDown.js';
import { AttributionLegend } from './merchant-lens/AttributionLegend.js';
import { CurrencyGroupSection } from './merchant-lens/CurrencyGroupSection.js';
import { ALL_TIME, type PeriodSelection } from './merchant-lens/period.js';
import { PeriodPicker } from './merchant-lens/PeriodPicker.js';
import {
  useMerchantLensModel,
  type MerchantLensModel,
} from './merchant-lens/useMerchantLensModel.js';

import type { ReactElement } from 'react';

import type { SpendPeriod } from './merchant-lens/types.js';

/**
 * `/purchases/merchants` — spend per merchant, with the unexplained bucket
 * always beside it.
 *
 * The roll-up layer and only that. The tag treemap, the per-item history and
 * the inventory cross-reference the merchant lens is specified to drill into
 * have no routes behind them; {@link AbsentDrillDown} names them as missing
 * rather than rendering a panel that would read as "no data".
 */
export function MerchantLensPage(): ReactElement {
  const { t } = useTranslation('purchases');
  const [now] = useState(() => new Date());
  const [selection, setSelection] = useState<PeriodSelection>(ALL_TIME);
  const model = useMerchantLensModel(selection);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('merchants.title')} description={t('merchants.intro')} />

      <PeriodPicker value={selection} onChange={setSelection} now={now} />

      <MerchantLensBody model={model} />

      <AttributionLegend />
      <AbsentDrillDown />
    </div>
  );
}

function MerchantLensBody({ model }: { model: MerchantLensModel }): ReactElement {
  const { t } = useTranslation('purchases');

  if (model.state === 'loading') {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t('merchants.loading')}
      </p>
    );
  }

  if (model.state === 'failed') {
    return (
      <div role="alert" className="border-destructive/50 bg-destructive/10 rounded-md border p-4">
        <p className="mb-2 text-sm font-medium">{t('merchants.error.title')}</p>
        <p className="text-muted-foreground mb-3 text-xs">{model.failure.message}</p>
        <Button size="sm" variant="outline" onClick={model.refetch}>
          {t('merchants.error.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PeriodCovered period={model.period} />
      {model.groups.length === 0 ? (
        <EmptyState />
      ) : (
        model.groups.map((group) => <CurrencyGroupSection key={group.currency} group={group} />)
      )}
    </div>
  );
}

/**
 * The window the figures were computed over, echoed from the response rather
 * than from the picker: a rendered total that states its own scope cannot be
 * read against the wrong one while a refetch is in flight.
 */
function PeriodCovered({ period }: { period: SpendPeriod }): ReactElement {
  const { t } = useTranslation('purchases');
  const { from, to } = period;
  return (
    <p className="text-muted-foreground text-xs">
      {from === null || to === null
        ? t('merchants.period.coveringAll')
        : t('merchants.period.covering', { from: formatDate(from), to: formatDate(to) })}
    </p>
  );
}

function EmptyState(): ReactElement {
  const { t } = useTranslation('purchases');
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="mb-2 text-base font-medium">{t('merchants.empty.title')}</p>
      <p className="text-muted-foreground text-sm">{t('merchants.empty.hint')}</p>
    </div>
  );
}
