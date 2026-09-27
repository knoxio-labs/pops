import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { OFFLINE_TITLE, StateBanner } from '../../foundation/feedback/state-banner.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useValueReport } from '../../inventory-web/useValueReport.js';
import { OverviewReportRoute } from './overview-route.js';
import { InsuranceReportRoute, WarrantiesReportRoute } from './report-routes.js';
import { downloadValuesCsv } from './reports-csv.js';
import {
  isValueReportEmpty,
  parseReportsUrl,
  REPORTS_QUERY_KEYS,
  writeReportsUrl,
  type ReportTab,
  type ReportsUrlPatch,
  type ReportsUrlState,
} from './reports-model.js';
import { ReportsShell } from './reports-shell.js';
import { ValuesTab } from './values-tab.js';

import type { ReactElement, ReactNode } from 'react';

function pageBanner(online: boolean, changed: ReturnType<typeof useChangedElsewhere>): ReactNode {
  if (!online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Reports stay as loaded until the connection is back."
      />
    );
  }
  if (!changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title="Reports changed elsewhere since this page loaded."
      detail="The report stays as it is until you reload."
      actionLabel="Reload"
      onAction={() => void changed.reload()}
    />
  );
}

interface ValuesReportRouteProps {
  readonly url: ReportsUrlState;
  readonly banner: ReactNode;
  readonly updateUrl: (patch: ReportsUrlPatch) => void;
  readonly onTabChange: (tab: ReportTab) => void;
  readonly onOpenItem: (id: string) => void;
}

function withInsuranceGaps(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set('tab', 'insurance');
  next.delete('by');
  next.delete('basis');
  next.delete('group');
  next.delete('locationId');
  next.delete('sort');
  next.set('gaps', '1');
  return next;
}

function useReportNavigation(
  url: ReportsUrlState,
  setSearchParams: ReturnType<typeof useSearchParams>[1]
) {
  const updateUrl = useCallback(
    (patch: ReportsUrlPatch): void => {
      setSearchParams((current) => writeReportsUrl(current, patch), { replace: true });
    },
    [setSearchParams]
  );
  const onTabChange = useCallback(
    (tab: ReportTab): void => {
      if (tab === 'values') {
        updateUrl({ tab });
        return;
      }
      updateUrl(
        url.tab === 'values' ? { tab, by: 'room', basis: 'replacement', group: null } : { tab }
      );
    },
    [updateUrl, url.tab]
  );
  const onOpenInsuranceGaps = useCallback(
    () => setSearchParams(withInsuranceGaps, { replace: true }),
    [setSearchParams]
  );
  return { onOpenInsuranceGaps, onTabChange, updateUrl };
}

function valuesReportBlockedReason(report: ReturnType<typeof useValueReport>): string | undefined {
  if (report.isPending || report.isFetching) return 'The values report is still loading.';
  if (report.isError) return 'The values report could not be loaded.';
  if (report.data === undefined || isValueReportEmpty(report.data)) {
    return 'Nothing to export yet.';
  }
  return undefined;
}

function valuesReportStatus(
  report: ReturnType<typeof useValueReport>
): 'loading' | 'error' | 'ready' {
  if (report.isError) return 'error';
  if (report.isPending || report.isFetching) return 'loading';
  return 'ready';
}

function ValuesReportRoute({
  url,
  banner,
  updateUrl,
  onTabChange,
  onOpenItem,
}: ValuesReportRouteProps): ReactElement {
  const report = useValueReport(url.by, url.basis);
  const blockedReason = valuesReportBlockedReason(report);
  const onExport =
    blockedReason !== undefined || report.data === undefined
      ? undefined
      : () => downloadValuesCsv(report.data, url.basis);
  const onPrint = blockedReason === undefined ? () => window.print() : undefined;
  return (
    <ReportsShell
      tab="values"
      exportBlocked={blockedReason}
      onExport={onExport}
      onPrint={onPrint}
      onTabChange={onTabChange}
      banner={banner}
    >
      <ValuesTab
        data={report.data}
        status={valuesReportStatus(report)}
        by={url.by}
        basis={url.basis}
        groupKey={url.group}
        onByChange={(by) => updateUrl({ by, group: null })}
        onBasisChange={(basis) => updateUrl({ basis })}
        onGroupChange={(group) => updateUrl({ group })}
        onOpenItem={onOpenItem}
        onRetry={() => void report.refetch()}
      />
    </ReportsShell>
  );
}

/** Renders the inventory Reports shell and its URL-selected report surface. */
export function ReportsPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseReportsUrl(searchParams);
  const online = useOnline();
  const changed = useChangedElsewhere({ queryKeys: REPORTS_QUERY_KEYS });
  const navigate = useNavigate();
  const { onOpenInsuranceGaps, onTabChange, updateUrl } = useReportNavigation(url, setSearchParams);
  const banner = pageBanner(online, changed);
  if (url.tab === 'values') {
    return (
      <ValuesReportRoute
        url={url}
        banner={banner}
        updateUrl={updateUrl}
        onTabChange={onTabChange}
        onOpenItem={(id) => void navigate(`/inventory/items/${encodeURIComponent(id)}`)}
      />
    );
  }
  if (url.tab === 'warranties') {
    return <WarrantiesReportRoute banner={banner} onTabChange={onTabChange} />;
  }
  if (url.tab === 'insurance') {
    return <InsuranceReportRoute banner={banner} onTabChange={onTabChange} />;
  }
  return (
    <OverviewReportRoute
      banner={banner}
      onTabChange={onTabChange}
      onOpenInsuranceGaps={onOpenInsuranceGaps}
    />
  );
}
