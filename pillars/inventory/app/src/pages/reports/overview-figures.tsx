import { StatCard } from '@pops/ui';

import { formatReportDollars } from './reports-model.js';
import { tierCounts, warrantyRows } from './warranty-model.js';

import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';
import type { ReportTab } from './reports-model.js';

/** Renders the four server-backed figures at the top of the overview. */
export function OverviewFigures({
  report,
  entries,
  now,
  onOpenTab,
}: {
  readonly report: WebReportsValuesResponse;
  readonly entries: readonly ReportEntry[];
  readonly now: Date;
  readonly onOpenTab: (tab: ReportTab) => void;
}): ReactElement {
  const counts = tierCounts(warrantyRows(entries, now));
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        title="Replacement value"
        value={formatReportDollars(report.totals.replacement)}
        description={`${report.totals.unvalued} without a replacement value`}
        color="sky"
        className="min-w-0"
      />
      <StatCard
        title="Paid"
        value={formatReportDollars(report.totals.purchase)}
        description="Purchase prices on record"
        color="violet"
        className="min-w-0"
      />
      <StatCard
        title="Counted"
        value={report.totals.records}
        description={`${report.totals.units} units, active only`}
        color="slate"
        className="min-w-0"
      />
      <StatCard
        title="Warranties ending"
        value={counts.soon}
        description="In the next 30 days"
        color={counts.soon > 0 ? 'amber' : 'slate'}
        onClick={() => onOpenTab('warranties')}
        className="min-w-0"
      />
    </div>
  );
}
