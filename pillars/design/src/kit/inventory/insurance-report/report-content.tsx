import { Download, FileText, Printer } from 'lucide-react';

import { Button, PageHeader, Skeleton } from '@pops/ui';

import { buildCsvContent } from './csv';
import { GroupTable } from './GroupTable';
import { ReportFilters } from './ReportFilters';
import { ReportSummary } from './ReportSummary';

import type { LocationTreeNode } from '../location-picker';
import type { InsuranceReport, SortBy } from './report-model';

interface ReportActionsProps {
  /**
   * The source builds the CSV and downloads it directly via
   * `URL.createObjectURL` + an anchor click. The canvas builds the same CSV
   * text and hands it to this prop instead of downloading it, since a
   * browser download is not something a design review needs to trigger for
   * real.
   */
  onExportCsv: () => void;
}

function ReportActions({ onExportCsv }: ReportActionsProps) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        prefix={<Download className="h-4 w-4" />}
        onClick={onExportCsv}
      >
        Export CSV
      </Button>
      <Button size="sm" prefix={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
        Print / PDF
      </Button>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ErrorState() {
  return (
    <div className="p-6">
      <p className="text-muted-foreground">Failed to load report.</p>
    </div>
  );
}

export interface ReportFilterState {
  locationId: string | undefined;
  includeChildren: boolean;
  sortBy: SortBy;
  onLocationChange: (id: string | null) => void;
  onIncludeChildrenChange: (checked: boolean) => void;
  onSortByChange: (value: string) => void;
}

export interface ReportContentProps {
  report: InsuranceReport;
  filters: ReportFilterState;
  locationTree: LocationTreeNode[];
  today: string;
  now: Date;
  onOpenItem: (id: string) => void;
  onExportCsv: (csv: string) => void;
}

/**
 * The header, filters, summary and location groups, shared by every render
 * of the report that isn't loading or errored. Ported from
 * `InsuranceReportPage.tsx`'s own `ReportContent`.
 */
export function ReportContent({
  report,
  filters,
  locationTree,
  today,
  now,
  onOpenItem,
  onExportCsv,
}: ReportContentProps) {
  const { locationId } = filters;
  return (
    <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none print:text-[11pt]">
      <PageHeader
        title={<span className="print:text-[14pt]">Insurance Report</span>}
        icon={<FileText className="h-6 w-6 text-muted-foreground print:hidden" />}
        actions={<ReportActions onExportCsv={() => onExportCsv(buildCsvContent(report.groups))} />}
        className="mb-6 print:mb-4"
      />
      <p className="text-sm text-muted-foreground -mt-5 mb-6">
        Generated {today}
        {locationId && report.groups.length === 1 && report.groups[0] && (
          <> — {report.groups[0].locationName}</>
        )}
      </p>
      <ReportFilters
        locationId={filters.locationId}
        includeChildren={filters.includeChildren}
        sortBy={filters.sortBy}
        locationTree={locationTree}
        onLocationChange={filters.onLocationChange}
        onIncludeChildrenChange={filters.onIncludeChildrenChange}
        onSortByChange={filters.onSortByChange}
      />
      <ReportSummary totalItems={report.totalItems} totalValue={report.totalValue} />
      {report.groups.map((group, groupIndex) => (
        <GroupTable
          key={group.locationId ?? 'unlocated'}
          group={group}
          groupIndex={groupIndex}
          now={now}
          onOpenItem={onOpenItem}
        />
      ))}
      {report.groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No inventory items found.</p>
        </div>
      )}
    </div>
  );
}
