import { useCallback, useState } from 'react';

import { useReportEntries } from '../../inventory-web/useReportEntries.js';
import { useValueReport } from '../../inventory-web/useValueReport.js';
import { downloadOverviewCsv } from './overview-csv.js';
import { OverviewTab } from './overview-tab.js';
import { isValueReportEmpty, type ReportTab } from './reports-model.js';
import { ReportsShell } from './reports-shell.js';
import { warrantyRows } from './warranty-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { InsuranceGapReason } from './insurance-model.js';

interface OverviewReportRouteProps {
  readonly banner: ReactNode;
  readonly onTabChange: (tab: ReportTab) => void;
  readonly onOpenInsuranceGaps: (reason: InsuranceGapReason) => void;
}

function overviewStatus(
  entries: ReturnType<typeof useReportEntries>,
  values: ReturnType<typeof useValueReport>
): 'loading' | 'error' | 'ready' {
  const hasEntries = entries.data !== undefined;
  const hasValues = values.data !== undefined;
  if ((entries.isError && !hasEntries) || (values.isError && !hasValues)) return 'error';
  if (entries.isPending || values.isPending || !hasEntries || !hasValues) return 'loading';
  return 'ready';
}

function overviewBlockedReason(
  status: 'loading' | 'error' | 'ready',
  report: ReturnType<typeof useValueReport>['data']
): string | undefined {
  if (status === 'error') return 'The reports could not be loaded.';
  if (status === 'loading') return 'The reports are still loading.';
  if (report === undefined || isValueReportEmpty(report)) return 'Nothing to export yet.';
  return undefined;
}

/** Renders the server-backed overview report and its report actions. */
export function OverviewReportRoute({
  banner,
  onTabChange,
  onOpenInsuranceGaps,
}: OverviewReportRouteProps): ReactElement {
  const entries = useReportEntries();
  const values = useValueReport('room', 'replacement');
  const [now] = useState(() => new Date(Date.now()));
  const status = overviewStatus(entries, values);
  const endingRows =
    status === 'ready'
      ? warrantyRows(entries.data ?? [], now).filter(
          (row) => row.tier === 'soon' || row.tier === 'quarter'
        )
      : [];
  const report = values.data;
  const blockedReason = overviewBlockedReason(status, report);
  const onExport =
    blockedReason === undefined && report !== undefined
      ? () => downloadOverviewCsv(report, endingRows)
      : undefined;
  const onPrint = blockedReason === undefined ? () => window.print() : undefined;
  const onRetry = useCallback((): void => {
    void entries.refetch();
    void values.refetch();
  }, [entries, values]);

  return (
    <ReportsShell
      tab="overview"
      exportBlocked={blockedReason}
      onExport={onExport}
      onPrint={onPrint}
      onTabChange={onTabChange}
      banner={banner}
    >
      <OverviewTab
        values={values.data}
        entries={entries.data ?? []}
        status={status}
        now={now}
        onOpenTab={onTabChange}
        onOpenInsuranceGaps={onOpenInsuranceGaps}
        onRetry={onRetry}
      />
    </ReportsShell>
  );
}
