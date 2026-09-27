import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { usePaperlessState } from '../../inventory-web/usePaperlessStatus.js';
import { useReportEntries } from '../../inventory-web/useReportEntries.js';
import { useWebSearchLocations } from '../../inventory-web/useWebSearchLocations.js';
import {
  insuranceCsv,
  insuranceGroups,
  insuranceSearch,
  parseInsuranceOptions,
  type InsuranceOptions,
} from './insurance-model.js';
import { InsuranceTab } from './insurance-tab.js';
import { downloadCsv, reportsSearchWith } from './report-model.js';
import { ReportsShell } from './reports-shell.js';
import { WarrantiesTab } from './warranties-tab.js';
import { warrantyRows, warrantiesCsv, type WarrantyTier } from './warranty-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { ReportTab } from './reports-model.js';

type ReportStatus = 'ready' | 'loading' | 'error';

interface ReportRouteProps {
  banner: ReactNode;
  onTabChange: (tab: ReportTab) => void;
}

function exportBlockedReason(status: ReportStatus, rowCount: number): string | undefined {
  return status !== 'ready' || rowCount === 0 ? 'Nothing to export yet.' : undefined;
}

function warrantyStatus(entries: { isError: boolean; isPending: boolean }): ReportStatus {
  if (entries.isError) return 'error';
  if (entries.isPending) return 'loading';
  return 'ready';
}

function insuranceStatus(
  entries: { isError: boolean; isPending: boolean },
  locations: { status: 'pending' | 'error' | 'success' }
): ReportStatus {
  if (entries.isError || locations.status === 'error') return 'error';
  if (entries.isPending || locations.status === 'pending') return 'loading';
  return 'ready';
}

/** Renders the URL-backed Insurance report route and its export actions. */
export function InsuranceReportRoute({ banner, onTabChange }: ReportRouteProps): ReactElement {
  const entries = useReportEntries();
  const locations = useWebSearchLocations();
  const paperlessState = usePaperlessState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const options = parseInsuranceOptions(searchParams);
  const world = useMemo(() => buildWorld([], locations.locations), [locations.locations]);
  const status = insuranceStatus(entries, locations);
  const groups = status === 'ready' ? insuranceGroups(entries.data ?? [], world, options) : [];
  const exportBlocked = exportBlockedReason(status, groups.length);
  const onOptionsChange = useCallback(
    (patch: Partial<InsuranceOptions>): void => {
      const next = { ...options, ...patch };
      void navigate(
        { search: reportsSearchWith('insurance', insuranceSearch(next)) },
        { replace: true }
      );
    },
    [navigate, options]
  );
  const onRetry = useCallback((): void => {
    void entries.refetch();
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
  }, [entries, queryClient]);
  const onExport =
    exportBlocked === undefined
      ? () => downloadCsv(insuranceCsv(groups), 'inventory-insurance.csv')
      : undefined;

  return (
    <ReportsShell
      tab="insurance"
      exportBlocked={exportBlocked}
      onExport={onExport}
      onPrint={exportBlocked === undefined ? () => window.print() : undefined}
      onTabChange={onTabChange}
      banner={banner}
    >
      <InsuranceTab
        entries={entries.data ?? []}
        world={world}
        groups={groups}
        options={options}
        status={status}
        paperlessState={paperlessState}
        onOptionsChange={onOptionsChange}
        onRetry={onRetry}
      />
    </ReportsShell>
  );
}

/** Renders the local Warranties report route and its export actions. */
export function WarrantiesReportRoute({ banner, onTabChange }: ReportRouteProps): ReactElement {
  return <WarrantiesReportRouteView banner={banner} onTabChange={onTabChange} />;
}

function WarrantiesReportRouteView({ banner, onTabChange }: ReportRouteProps): ReactElement {
  const entries = useReportEntries();
  const paperlessState = usePaperlessState();
  const [tier, setTier] = useState<WarrantyTier>('soon');
  const [now] = useState(() => new Date(Date.now()));
  const rows = warrantyRows(entries.data ?? [], now);
  const status = warrantyStatus(entries);
  const visibleRows = rows.filter((row) => row.tier === tier);
  const exportBlocked = exportBlockedReason(status, visibleRows.length);
  const onExport =
    exportBlocked === undefined
      ? () => downloadCsv(warrantiesCsv(visibleRows), `inventory-warranties-${tier}.csv`)
      : undefined;

  return (
    <ReportsShell
      tab="warranties"
      exportBlocked={exportBlocked}
      onExport={onExport}
      onPrint={exportBlocked === undefined ? () => window.print() : undefined}
      onTabChange={onTabChange}
      banner={banner}
    >
      <WarrantiesTab
        entries={entries.data ?? []}
        status={status}
        tier={tier}
        now={now}
        paperlessState={paperlessState}
        onTierChange={setTier}
        onRetry={() => void entries.refetch()}
      />
    </ReportsShell>
  );
}
