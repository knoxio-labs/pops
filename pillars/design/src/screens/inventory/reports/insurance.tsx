import {
  insuranceReportEmptyLocationId,
  insuranceReportItemsAt,
  insuranceReportItemsEmpty,
  insuranceReportLocationTree,
} from '@/fixtures/inventory-insurance-report';
import {
  ErrorState,
  LoadingState,
  ReportContent,
} from '@/kit/inventory/insurance-report/report-content';
import { buildInsuranceReport } from '@/kit/inventory/insurance-report/report-model';
import { useMemo, useState } from 'react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReportFilterState } from '@/kit/inventory/insurance-report/report-content';
import type { SortBy, SortableReportItem } from '@/kit/inventory/insurance-report/report-model';
import type { LocationTreeNode } from '@/kit/inventory/location-picker';

export const meta: ScreenMeta = { title: 'Insurance report', order: 2, frame: 'web' };

export interface InitialInsuranceFilters {
  locationId?: string;
  includeChildren?: boolean;
  sortBy?: SortBy;
}

export interface InsuranceReportPageProps {
  items?: SortableReportItem[];
  locationTree?: LocationTreeNode[];
  isLoading?: boolean;
  isError?: boolean;
  /** The instant `warrantyStatus` and the report's "Generated" date are computed against. */
  now?: Date;
  initialFilters?: InitialInsuranceFilters;
  /** In place of `navigate(`/inventory/items/${id}`)`; the canvas can't leave its iframe. */
  onOpenItem?: (id: string) => void;
  /** In place of the source's direct download; see `ReportActionsProps.onExportCsv` in the kit. */
  onExportCsv?: (csv: string) => void;
}

/**
 * The filter state `useReportModel.ts` kept in the URL's search params, held
 * in `useState` instead: the canvas has no router, and a reviewer changing a
 * filter only needs the report to react, not a shareable URL.
 */
function useInsuranceFilters(initial: InitialInsuranceFilters): ReportFilterState {
  const [locationId, setLocationId] = useState(initial.locationId);
  const [includeChildren, setIncludeChildren] = useState(initial.includeChildren ?? true);
  const [sortBy, setSortBy] = useState<SortBy>(initial.sortBy ?? 'value');

  return {
    locationId,
    includeChildren,
    sortBy,
    onLocationChange: (id) => setLocationId(id ?? undefined),
    onIncludeChildrenChange: setIncludeChildren,
    onSortByChange: (value) => setSortBy(value as SortBy),
  };
}

/**
 * `/inventory/reports/insurance`: every inventory item grouped by location,
 * filterable to one location and its sub-locations, sorted by value, name or
 * type, with a CSV export and a print/PDF layout.
 */
export function InsuranceReportPage({
  now = new Date(),
  items = insuranceReportItemsAt(now),
  locationTree = insuranceReportLocationTree,
  isLoading = false,
  isError = false,
  initialFilters = {},
  onOpenItem = () => {},
  onExportCsv = () => {},
}: InsuranceReportPageProps) {
  const filters = useInsuranceFilters(initialFilters);
  const today = useMemo(
    () => now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    [now]
  );
  const report = useMemo(
    () =>
      buildInsuranceReport(items, locationTree, {
        locationId: filters.locationId,
        includeChildren: filters.locationId ? filters.includeChildren : undefined,
        sortBy: filters.sortBy,
      }),
    [items, locationTree, filters.locationId, filters.includeChildren, filters.sortBy]
  );

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <ReportContent
      report={report}
      filters={filters}
      locationTree={locationTree}
      today={today}
      now={now}
      onOpenItem={onOpenItem}
      onExportCsv={onExportCsv}
    />
  );
}

export const states: ScreenStates = {
  loading: () => <InsuranceReportPage isLoading />,
  error: () => <InsuranceReportPage isError />,
  empty: () => <InsuranceReportPage items={insuranceReportItemsEmpty} />,
  'filtered-empty': () => (
    <InsuranceReportPage initialFilters={{ locationId: insuranceReportEmptyLocationId }} />
  ),
  'single-row-group': () => (
    <InsuranceReportPage initialFilters={{ locationId: 'loc-bookshelf' }} />
  ),
  'many-row-group': () => <InsuranceReportPage initialFilters={{ locationId: 'loc-kitchen' }} />,
  'no-replacement-value': () => (
    <InsuranceReportPage initialFilters={{ locationId: 'loc-filing' }} />
  ),
  'expired-warranty': () => <InsuranceReportPage initialFilters={{ locationId: 'loc-garage' }} />,
  'active-warranty-countdown': () => (
    <InsuranceReportPage initialFilters={{ locationId: 'loc-desk' }} />
  ),
  'sorted-by-name': () => <InsuranceReportPage initialFilters={{ sortBy: 'name' }} />,
};

export default function InsuranceReportScreen() {
  const [now] = useState(() => new Date());
  return <InsuranceReportPage now={now} items={insuranceReportItemsAt(now)} />;
}
