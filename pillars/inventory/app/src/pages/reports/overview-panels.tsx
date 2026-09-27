import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { OverviewInsuranceGaps } from './overview-insurance-gaps.js';
import { formatReportDollars } from './reports-model.js';
import { ReportPanel, ShareBar } from './reports-parts.js';
import { daysLabel, warrantyRows, type WarrantyRow } from './warranty-model.js';

import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';
import type { ReportTab } from './reports-model.js';

function OpenLink({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="-mr-2 shrink-0 text-xs text-muted-foreground"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function ValueByRoom({
  report,
  onOpenTab,
}: {
  readonly report: WebReportsValuesResponse;
  readonly onOpenTab: (tab: ReportTab) => void;
}): ReactElement {
  const groups = report.groups.slice(0, 7);
  return (
    <ReportPanel
      title="Value by room"
      aside={<OpenLink label="All values" onClick={() => onOpenTab('values')} />}
    >
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No valued rooms yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {groups.map((group) => (
            <li
              key={group.key}
              className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-x-3 gap-y-1 px-4 py-2"
            >
              <span className="truncate text-sm">{group.label}</span>
              <span className="text-right text-sm tabular-nums">
                {formatReportDollars(group.value)}
              </span>
              <ShareBar share={group.share} className="col-span-2" />
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}

function WarrantyRows({ rows }: { readonly rows: readonly WarrantyRow[] }): ReactElement {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">Nothing ends in the next 90 days.</p>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.entry.itemId}>
          <Link
            to={`/inventory/items/${encodeURIComponent(row.entry.itemId)}`}
            aria-label={`Open ${row.entry.name}`}
            className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate text-sm">{row.entry.name}</span>
            <span
              className={
                row.tier === 'soon'
                  ? 'shrink-0 text-xs font-medium'
                  : 'shrink-0 text-xs text-muted-foreground'
              }
            >
              {daysLabel(row.days)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EndingInNinetyDays({
  entries,
  now,
  onOpenTab,
}: {
  readonly entries: readonly ReportEntry[];
  readonly now: Date;
  readonly onOpenTab: (tab: ReportTab) => void;
}): ReactElement {
  const rows = warrantyRows(entries, now).filter(
    (row) => row.tier === 'soon' || row.tier === 'quarter'
  );
  return (
    <ReportPanel
      title="Ending in 90 days"
      aside={<OpenLink label="All warranties" onClick={() => onOpenTab('warranties')} />}
    >
      <WarrantyRows rows={rows} />
    </ReportPanel>
  );
}

/** Renders the three overview panels beneath the figures. */
export function OverviewPanels({
  report,
  entries,
  now,
  onOpenTab,
  onOpenInsuranceGaps,
}: {
  readonly report: WebReportsValuesResponse;
  readonly entries: readonly ReportEntry[];
  readonly now: Date;
  readonly onOpenTab: (tab: ReportTab) => void;
  readonly onOpenInsuranceGaps: () => void;
}): ReactElement {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
      <ValueByRoom report={report} onOpenTab={onOpenTab} />
      <EndingInNinetyDays entries={entries} now={now} onOpenTab={onOpenTab} />
      <OverviewInsuranceGaps report={report} onOpen={onOpenInsuranceGaps} />
    </div>
  );
}
