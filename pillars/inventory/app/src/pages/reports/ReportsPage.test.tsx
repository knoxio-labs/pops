import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { createTestQueryClient } from '../../inventory-web/test-utils';
import { PAPERLESS_DOWN_REASON } from './insurance-rows.js';
import { valuesGroup, valuesReport } from './reports-test-fixtures.js';
import { ReportsPage } from './ReportsPage.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PaperlessState } from '../../inventory-web/usePaperlessStatus.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

const mocks = vi.hoisted(() => ({
  useChangedElsewhere: vi.fn(),
  useOnline: vi.fn(),
  useValueReport: vi.fn(),
  useReportEntries: vi.fn(),
  usePaperlessState: vi.fn(),
  useLocationModels: vi.fn(),
  downloadCsv: vi.fn(),
  downloadOverviewCsv: vi.fn(),
}));

vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/useValueReport.js', () => ({
  useValueReport: (...args: unknown[]) => mocks.useValueReport(...args),
}));
vi.mock('../../inventory-web/useReportEntries.js', () => ({
  useReportEntries: () => mocks.useReportEntries(),
}));
vi.mock('../../inventory-web/usePaperlessStatus.js', () => ({
  usePaperlessState: () => mocks.usePaperlessState(),
}));
vi.mock('../../inventory-web/useWebSearchLocations.js', () => ({
  useWebSearchLocations: () => mocks.useLocationModels(),
}));
vi.mock('./report-model.js', async () => {
  const actual = await vi.importActual<typeof import('./report-model.js')>('./report-model.js');
  return { ...actual, downloadCsv: mocks.downloadCsv };
});
vi.mock('./overview-csv.js', () => ({
  downloadOverviewCsv: (...args: unknown[]) => mocks.downloadOverviewCsv(...args),
}));

const locations: LocationModel[] = [
  { id: 'house', name: 'House', parentId: null, kind: 'property' },
  { id: 'garage', name: 'Garage', parentId: 'house', kind: 'room' },
  { id: 'kitchen', name: 'Kitchen', parentId: 'house', kind: 'room' },
];

const connectedPaperless: PaperlessState = {
  available: true,
  configured: true,
  baseUrl: 'https://paperless.example',
};

function reportEntry(id: string, overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    code: null,
    effectiveLocationId: 'garage',
    isContainer: false,
    photos: 1,
    place: 'Garage',
    purchasePrice: 40,
    purchasedOn: '2025-01-01',
    quantity: 1,
    receiptId: null,
    replacementValue: 100,
    room: { key: 'garage', label: 'Garage' },
    typeKey: 'misc',
    warrantyExpires: null,
    ...overrides,
    itemId: id,
    name: overrides.name ?? id,
  };
}

function overviewReport() {
  return valuesReport({
    groups: [valuesGroup({ key: 'garage', label: 'Garage', records: 1, share: 1, value: 100 })],
    totals: {
      purchase: 40,
      records: 1,
      replacement: 100,
      units: 1,
      unvalued: 0,
      withoutPhoto: 0,
    },
  });
}

function queryState<T>(
  overrides: Partial<{
    data: T | undefined;
    isError: boolean;
    isFetching: boolean;
    isPending: boolean;
    refetch: () => unknown;
  }> = {}
) {
  return {
    data: overrides.data,
    isError: overrides.isError ?? false,
    isFetching: overrides.isFetching ?? false,
    isPending: overrides.isPending ?? false,
    refetch: overrides.refetch ?? vi.fn(),
  };
}

function LocationText(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderReports(initialEntry = '/inventory/reports') {
  const client = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/inventory/reports"
            element={
              <>
                <ReportsPage />
                <LocationText />
              </>
            }
          />
          <Route path="/inventory/items/:id" element={<LocationText />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...result, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 8, 25, 23, 30).getTime());
  mocks.useOnline.mockReturnValue(true);
  mocks.useChangedElsewhere.mockReturnValue({ groups: [], stale: false, reload: vi.fn() });
  mocks.useValueReport.mockReturnValue(queryState({ isPending: true }));
  mocks.useReportEntries.mockReturnValue(queryState<ReportEntry[]>({ isPending: true }));
  mocks.usePaperlessState.mockReturnValue(connectedPaperless);
  mocks.useLocationModels.mockReturnValue({ locations, status: 'success' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReportsPage', () => {
  it('renders the overview figures and panels inside the shared shell by default', () => {
    mocks.useValueReport.mockReturnValue(queryState({ data: overviewReport() }));
    mocks.useReportEntries.mockReturnValue(
      queryState({ data: [reportEntry('soon', { warrantyExpires: '2026-10-01' })] })
    );

    renderReports();

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('Replacement value')).toBeInTheDocument();
    expect(screen.getByText('Value by room')).toBeInTheDocument();
    expect(screen.getByText('Ending in 90 days')).toBeInTheDocument();
    expect(screen.getByText('What an insurer would ask about')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
  });

  it('opens the detail tabs and preserves item links from overview panels', async () => {
    mocks.useValueReport.mockReturnValue(
      queryState({
        data: valuesReport({
          groups: [
            valuesGroup({ key: 'garage', label: 'Garage', records: 1, share: 1, value: 100 }),
          ],
          totals: {
            purchase: 40,
            records: 1,
            replacement: 100,
            units: 1,
            unvalued: 1,
            withoutPhoto: 1,
          },
        }),
      })
    );
    mocks.useReportEntries.mockReturnValue(
      queryState({ data: [reportEntry('soon', { warrantyExpires: '2026-10-01' })] })
    );
    renderReports();

    expect(screen.getByRole('link', { name: 'Open soon' })).toHaveAttribute(
      'href',
      '/inventory/items/soon'
    );

    fireEvent.click(screen.getByRole('button', { name: 'All values' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tab=values'));

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/reports')
    );

    fireEvent.click(screen.getByRole('button', { name: 'All warranties' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tab=warranties'));

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/reports')
    );

    fireEvent.click(screen.getByRole('button', { name: /No replacement value/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('tab=insurance&gaps=1')
    );
  });

  it('keeps overview actions available for loaded data', () => {
    mocks.useValueReport.mockReturnValue(queryState({ data: overviewReport() }));
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(print).toHaveBeenCalledOnce();
    expect(mocks.downloadOverviewCsv).toHaveBeenCalledOnce();
  });

  it.each([
    ['loading', queryState({ isPending: true }), queryState<ReportEntry[]>({ isPending: true })],
    ['error', queryState({ isError: true }), queryState<ReportEntry[]>({ data: [] })],
    ['empty', queryState({ data: valuesReport() }), queryState<ReportEntry[]>({ data: [] })],
  ] as const)('handles overview %s without enabling export or print', (_state, values, entries) => {
    mocks.useValueReport.mockReturnValue(values);
    mocks.useReportEntries.mockReturnValue(entries);

    renderReports();

    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    if (_state === 'loading') {
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    }
    if (_state === 'error') expect(screen.getByText('Reports did not load')).toBeInTheDocument();
    if (_state === 'empty') expect(screen.getByText('Nothing to report yet')).toBeInTheDocument();
  });

  it('retries both overview reads after an error', () => {
    const valueRefetch = vi.fn();
    const entryRefetch = vi.fn();
    mocks.useValueReport.mockReturnValue(queryState({ isError: true, refetch: valueRefetch }));
    mocks.useReportEntries.mockReturnValue(queryState({ isError: true, refetch: entryRefetch }));

    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(valueRefetch).toHaveBeenCalledOnce();
    expect(entryRefetch).toHaveBeenCalledOnce();
  });

  it('keeps loaded overview data visible during a refetch', () => {
    mocks.useValueReport.mockReturnValue(queryState({ data: overviewReport(), isFetching: true }));
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));

    renderReports();

    expect(screen.getByText('Value by room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('loads Values with the URL-selected server query', () => {
    const data = valuesReport({
      groups: [valuesGroup({ records: 1, value: 125 })],
      totals: {
        purchase: 100,
        records: 1,
        replacement: 125,
        units: 1,
        unvalued: 0,
        withoutPhoto: 0,
      },
    });
    mocks.useValueReport.mockReturnValue(queryState({ data }));

    renderReports('/inventory/reports?tab=values&by=type&basis=purchase');

    expect(mocks.useValueReport).toHaveBeenCalledWith('type', 'purchase');
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('omits report defaults from the URL and preserves unrelated parameters', async () => {
    mocks.useValueReport.mockReturnValue(
      queryState({
        data: valuesReport({
          groups: [valuesGroup({ records: 1 })],
          totals: {
            purchase: 1,
            records: 1,
            replacement: 1,
            units: 1,
            unvalued: 0,
            withoutPhoto: 0,
          },
        }),
      })
    );
    renderReports('/inventory/reports?tab=values&keep=1');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'By type' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/reports?tab=values&keep=1&by=type'
      )
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/reports?keep=1')
    );
  });

  it.each([
    ['loading', queryState({ isPending: true })],
    ['error', queryState({ isError: true })],
    ['empty', queryState({ data: valuesReport() })],
  ] as const)('disables print and CSV while Values is %s', (_state, query) => {
    mocks.useValueReport.mockReturnValue(query);
    renderReports('/inventory/reports?tab=values');

    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('a failed entries read shows Warranties did not load and Retry refetches it', () => {
    const refetch = vi.fn();
    mocks.useReportEntries.mockReturnValue(queryState({ isError: true, refetch }));
    renderReports('/inventory/reports?tab=warranties');

    expect(screen.getByText('Warranties did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();

    mocks.useReportEntries.mockReturnValue(queryState<ReportEntry[]>({ isPending: true }));
    renderReports('/inventory/reports?tab=warranties');
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('choosing a tier lists its rows or its empty line', () => {
    const entries = [
      reportEntry('soon', { warrantyExpires: '2026-10-01' }),
      reportEntry('quarter', { warrantyExpires: '2026-11-01' }),
      reportEntry('later', { warrantyExpires: '2027-01-01' }),
      reportEntry('expired', { warrantyExpires: '2026-09-01' }),
    ];
    mocks.useReportEntries.mockReturnValue(queryState({ data: entries }));
    const view = renderReports('/inventory/reports?tab=warranties');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /31 to 90 days/ }));
    expect(screen.getByText('quarter')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Later/ }));
    expect(screen.getByText('later')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Expired/ }));
    expect(screen.getByText('expired')).toBeInTheDocument();

    view.unmount();
    mocks.useReportEntries.mockReturnValue(
      queryState({ data: [reportEntry('soon', { warrantyExpires: '2026-10-01' })] })
    );
    renderReports('/inventory/reports?tab=warranties');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /31 to 90 days/ }));
    expect(
      screen.getByText('No warranty ends between 31 and 90 days from now.')
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Later/ }));
    expect(screen.getByText('No warranty runs longer than 90 days.')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Expired/ }));
    expect(screen.getByText('No recorded warranty has ended.')).toBeInTheDocument();
  });

  it('no warranty rows shows No warranties recorded', () => {
    mocks.useReportEntries.mockReturnValue(queryState<ReportEntry[]>({ data: [] }));
    renderReports('/inventory/reports?tab=warranties');

    expect(screen.getByText('No warranties recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('the Insurance tab scopes to locationId from the URL', () => {
    mocks.useReportEntries.mockReturnValue(
      queryState({
        data: [
          reportEntry('garage-item'),
          reportEntry('kitchen-item', {
            effectiveLocationId: 'kitchen',
            place: 'Kitchen',
            room: { key: 'kitchen', label: 'Kitchen' },
          }),
          reportEntry('in-hand', {
            effectiveLocationId: null,
            room: { key: 'in-hand', label: 'In hand' },
          }),
        ],
      })
    );

    renderReports('/inventory/reports?tab=insurance&locationId=garage');

    expect(screen.getByText('garage-item')).toBeInTheDocument();
    expect(screen.queryByText('kitchen-item')).not.toBeInTheDocument();
    expect(screen.queryByText('in-hand')).not.toBeInTheDocument();
  });

  it('Insurance with a place waits for the location tree before filtering', () => {
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));
    mocks.useLocationModels.mockReturnValue({ locations: [], status: 'pending' });

    renderReports('/inventory/reports?tab=insurance&locationId=garage');

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('No items match these filters')).not.toBeInTheDocument();
  });

  it('a failed location tree shows the schedule load failure', () => {
    const refetch = vi.fn();
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')], refetch }));
    mocks.useLocationModels.mockReturnValue({ locations: [], status: 'error' });
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

    renderReports('/inventory/reports?tab=insurance');
    expect(screen.getByText('The schedule did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LOCATIONS_TREE_QUERY_KEY });
    invalidate.mockRestore();
  });

  it('no entries shows Nothing to insure yet', () => {
    mocks.useReportEntries.mockReturnValue(queryState<ReportEntry[]>({ data: [] }));
    renderReports('/inventory/reports?tab=insurance');

    expect(screen.getByText('Nothing to insure yet')).toBeInTheDocument();
  });

  it('Only gaps and Name write gaps=1 and sort=name', async () => {
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));
    renderReports('/inventory/reports?tab=insurance');

    fireEvent.click(screen.getByRole('switch', { name: 'Only gaps' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Name' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/reports?tab=insurance&gaps=1&sort=name'
      )
    );
  });

  it('Insurance Clear resets the place and gaps and keeps the sort', async () => {
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));
    renderReports('/inventory/reports?tab=insurance&locationId=empty&gaps=1&sort=name');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/reports?tab=insurance&sort=name'
      )
    );
  });

  it('Paperless down disables receipt links with the reason and shows the banner', () => {
    mocks.usePaperlessState.mockReturnValue({
      available: false,
      configured: true,
      baseUrl: 'https://paperless.example',
    });
    mocks.useReportEntries.mockReturnValue(
      queryState({
        data: [reportEntry('receipt-item', { receiptId: 42, warrantyExpires: '2026-10-01' })],
      })
    );

    renderReports('/inventory/reports?tab=warranties');

    expect(screen.getByText(PAPERLESS_DOWN_REASON)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open receipt 42 in Paperless' })).toBeDisabled();
  });

  it('Export on Warranties writes the rows of the chosen tier', () => {
    mocks.useReportEntries.mockReturnValue(
      queryState({ data: [reportEntry('soon', { warrantyExpires: '2026-10-01', receiptId: 42 })] })
    );
    renderReports('/inventory/reports?tab=warranties');

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'Item,Code,Room,Ends,Days,Value,Receipt\nsoon,,Garage,2026-10-01,In 6 days,100,42',
      'inventory-warranties-soon.csv'
    );
  });

  it('Export on Insurance writes the rows shown', () => {
    mocks.useReportEntries.mockReturnValue(
      queryState({
        data: [
          reportEntry('valued-photo', { receiptId: 1 }),
          reportEntry('gap-no-photo', { photos: 0, receiptId: 2 }),
        ],
      })
    );
    renderReports('/inventory/reports?tab=insurance&gaps=1');

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const [csv, filename] = mocks.downloadCsv.mock.calls[0] ?? [];
    expect(filename).toBe('inventory-insurance.csv');
    expect(csv).toContain(
      'Room,Place,Item,Code,Quantity,Unit value,Total value,Purchased,Warranty ends,Receipt,Photos'
    );
    expect(csv).toContain('gap-no-photo,');
    expect(csv).not.toContain('valued-photo,');
  });

  it('shows offline before stale state and provides a stale reload action', () => {
    mocks.useValueReport.mockReturnValue(queryState({ data: overviewReport() }));
    mocks.useReportEntries.mockReturnValue(queryState({ data: [reportEntry('item')] }));
    mocks.useOnline.mockReturnValue(false);
    mocks.useChangedElsewhere.mockReturnValue({ stale: true, groups: [], reload: vi.fn() });
    renderReports();

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.getByText('Value by room')).toBeInTheDocument();
    expect(
      screen.queryByText('Reports changed elsewhere since this page loaded.')
    ).not.toBeInTheDocument();

    const reload = vi.fn();
    mocks.useOnline.mockReturnValue(true);
    mocks.useChangedElsewhere.mockReturnValue({ stale: true, groups: [], reload });
    const view = renderReports();
    expect(
      screen.getByText('Reports changed elsewhere since this page loaded.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    view.unmount();
  });
});
