import { merchantOrdersByKey } from '@/fixtures/purchases-merchant-orders';
import {
  allTimePeriod,
  boundedPeriod,
  merchantSpendGroups,
  merchantSpendGroupsEmpty,
  merchantSpendGroupsSingleCurrency,
} from '@/fixtures/purchases-merchant-spend';
import { EmptyPanel } from '@/kit/purchases/empty-panel';
import { AbsentDrillDown } from '@/kit/purchases/merchant-lens/absent-drill-down';
import { AttributionLegend } from '@/kit/purchases/merchant-lens/attribution-legend';
import { CurrencyGroupSection } from '@/kit/purchases/merchant-lens/currency-group-section';
import { ALL_TIME } from '@/kit/purchases/merchant-lens/period';
import { PeriodPicker } from '@/kit/purchases/merchant-lens/period-picker';
import { RetryableError } from '@/kit/purchases/retryable-error';
import { useState } from 'react';

import { formatDate, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { CurrencyGroup, SpendPeriod } from '@/fixtures/purchases-merchant-spend';
import type { DrillDownState } from '@/kit/purchases/merchant-lens/merchant-row';
import type { PeriodSelection } from '@/kit/purchases/merchant-lens/period';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Merchant lens', order: 2, frame: 'web' };

/**
 * The header, the period picker and the two fixed sections that bracket the
 * body, shared by the populated page and its loading/error states so all
 * four agree on everything except the middle.
 */
function Shell({
  selection,
  onSelectionChange,
  now,
  children,
}: {
  selection: PeriodSelection;
  onSelectionChange: (next: PeriodSelection) => void;
  now: Date;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Merchant spend"
        description="What each merchant was paid, and how much of that a matched charge explains."
      />
      <PeriodPicker value={selection} onChange={onSelectionChange} now={now} />
      {children}
      <AttributionLegend />
      <AbsentDrillDown />
    </div>
  );
}

function PeriodCovered({ from, to }: { from: string | null; to: string | null }) {
  return (
    <p className="text-muted-foreground text-xs">
      {from === null || to === null
        ? 'Covering every order on record'
        : `Covering ${formatDate(from)} to ${formatDate(to)}`}
    </p>
  );
}

function MerchantsEmptyState() {
  return (
    <EmptyPanel
      title="No spend in this period"
      hint="No order in the selected window reached the roll-up. Widen the period to see the rest."
    />
  );
}

/**
 * `/purchases/merchants` — spend per merchant, with the unexplained bucket
 * always beside it. The roll-up layer and only that: the tag treemap and
 * per-item drill-downs it is specified to lead into have no data behind
 * them here, which is what {@link AbsentDrillDown} says.
 */
export function MerchantLensPage({
  groups,
  period = allTimePeriod,
  initialSelection = ALL_TIME,
  openDrillDowns = false,
  drillDown = 'ready',
}: {
  groups: CurrencyGroup[];
  /**
   * The window the roll-up reported, never the one the picker shows. The
   * picker has already moved while a refetch is in flight, and figures
   * captioned with the wrong window are a disagreement a reader cannot see.
   */
  period?: SpendPeriod;
  initialSelection?: PeriodSelection;
  openDrillDowns?: boolean;
  drillDown?: DrillDownState;
}) {
  const [now] = useState(() => new Date());
  const [selection, setSelection] = useState<PeriodSelection>(initialSelection);

  return (
    <Shell selection={selection} onSelectionChange={setSelection} now={now}>
      <div className="space-y-6">
        <PeriodCovered from={period.from} to={period.to} />
        {groups.length === 0 ? (
          <MerchantsEmptyState />
        ) : (
          groups.map((group) => (
            <CurrencyGroupSection
              key={group.currency}
              group={group}
              ordersByMerchant={merchantOrdersByKey}
              openDrillDowns={openDrillDowns}
              drillDown={drillDown}
            />
          ))
        )}
      </div>
    </Shell>
  );
}

export const states: ScreenStates = {
  loading: () => (
    <Shell selection={ALL_TIME} onSelectionChange={() => {}} now={new Date()}>
      <p role="status" className="text-muted-foreground text-sm">
        Loading merchant spend…
      </p>
    </Shell>
  ),
  error: () => (
    <Shell selection={ALL_TIME} onSelectionChange={() => {}} now={new Date()}>
      <RetryableError
        title="Could not load merchant spend"
        message="The spend roll-up could not be computed: the analytics read timed out after 30s."
        retryLabel="Retry"
        onRetry={() => {}}
      />
    </Shell>
  ),
  empty: () => <MerchantLensPage groups={merchantSpendGroupsEmpty} />,
  'orders-open': () => (
    <MerchantLensPage groups={merchantSpendGroupsSingleCurrency} openDrillDowns />
  ),
  'orders-loading': () => (
    <MerchantLensPage
      groups={merchantSpendGroupsSingleCurrency}
      openDrillDowns
      drillDown="loading"
    />
  ),
  'orders-failed': () => (
    <MerchantLensPage
      groups={merchantSpendGroupsSingleCurrency}
      openDrillDowns
      drillDown="failed"
    />
  ),
  'single-currency': () => <MerchantLensPage groups={merchantSpendGroupsSingleCurrency} />,
  'bounded-period': () => (
    <MerchantLensPage groups={merchantSpendGroups} period={boundedPeriod} initialSelection="2026" />
  ),
};

export default function MerchantsScreen() {
  return <MerchantLensPage groups={merchantSpendGroups} />;
}
