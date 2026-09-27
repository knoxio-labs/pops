import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { valuesGroup, valuesReport } from './reports-test-fixtures.js';
import { ReportsPage } from './ReportsPage.js';

import type { ReactElement } from 'react';

const mocks = vi.hoisted(() => ({
  useChangedElsewhere: vi.fn(),
  useOnline: vi.fn(),
  useValueReport: vi.fn(),
}));

vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/useValueReport.js', () => ({
  useValueReport: (...args: unknown[]) => mocks.useValueReport(...args),
}));
vi.mock('../ReportDashboardPage.js', () => ({
  ReportDashboardPage: () => <div>Legacy dashboard</div>,
}));
vi.mock('../WarrantiesPage.js', () => ({
  WarrantiesPage: () => <div>Legacy warranties</div>,
}));
vi.mock('../InsuranceReportPage.js', () => ({
  InsuranceReportPage: () => <div>Legacy insurance</div>,
}));

function LocationText(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderReports(initialEntry = '/inventory/reports') {
  return render(
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
  );
}

function queryState(
  overrides: Partial<{
    data: ReturnType<typeof valuesReport> | undefined;
    isError: boolean;
    isFetching: boolean;
    isPending: boolean;
  }> = {}
) {
  return {
    data: undefined,
    isError: false,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useOnline.mockReturnValue(true);
  mocks.useChangedElsewhere.mockReturnValue({ groups: [], stale: false, reload: vi.fn() });
  mocks.useValueReport.mockReturnValue(queryState({ isPending: true }));
});

describe('ReportsPage', () => {
  it('renders the overview legacy page inside the shared shell by default', () => {
    renderReports();

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('Legacy dashboard')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
  });

  it('renders warranties and insurance legacy pages inside the shell', () => {
    renderReports('/inventory/reports?tab=warranties');
    expect(screen.getByText('Legacy warranties')).toBeInTheDocument();

    renderReports('/inventory/reports?tab=insurance');
    expect(screen.getByText('Legacy insurance')).toBeInTheDocument();
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

  it('shows offline before stale state and provides a stale reload action', () => {
    mocks.useOnline.mockReturnValue(false);
    mocks.useChangedElsewhere.mockReturnValue({ stale: true, groups: [], reload: vi.fn() });
    renderReports();

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(
      screen.queryByText('Reports changed elsewhere since this page loaded.')
    ).not.toBeInTheDocument();

    const reload = vi.fn();
    mocks.useOnline.mockReturnValue(true);
    mocks.useChangedElsewhere.mockReturnValue({ stale: true, groups: [], reload });
    renderReports();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
