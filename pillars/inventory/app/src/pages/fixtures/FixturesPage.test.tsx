import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useFixturesPageModel: vi.fn(),
  useConnectionsTabCounts: vi.fn(),
}));

vi.mock('./fixtures-page-model.js', () => ({
  useFixturesPageModel: (...args: unknown[]) => mocks.useFixturesPageModel(...args),
}));
vi.mock('../../inventory-web/useConnectionsTabCounts.js', () => ({
  useConnectionsTabCounts: (...args: unknown[]) => mocks.useConnectionsTabCounts(...args),
}));

import { FixturesPage } from './FixturesPage.js';

import type { ReactElement } from 'react';

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const fixture = {
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'fixture-1',
  lastEditedTime: '2026-09-02T00:00:00.000Z',
  locationId: 'room-1',
  name: 'Desk outlet',
  notes: 'Behind the desk',
  type: 'power',
  wiredCount: 1,
  wiredNames: ['Desk lamp'],
};

function pageModel(overrides: Record<string, unknown> = {}) {
  return {
    filters: {
      url: { query: '', kind: 'all' },
      queryDraft: '',
      kindDraft: 'all',
      filter: { query: '', kind: 'all' },
      serverFilter: { query: '', kind: 'all' },
      setQueryDraft: vi.fn(),
      setKindDraft: vi.fn(),
      clearFilters: vi.fn(),
    },
    fixtures: {
      rows: [fixture],
      total: 1,
      status: 'success' as const,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    },
    unfilteredTotal: 1,
    locations: {
      locations: [{ id: 'room-1', name: 'Office', parentId: null, kind: 'room' as const }],
      status: 'success' as const,
      refetch: vi.fn(),
    },
    online: true,
    changed: { stale: false, groups: [], reload: vi.fn() },
    mutations: {
      save: vi.fn().mockResolvedValue({ ...fixture, notes: null }),
    },
    hasLoaded: true,
    status: 'success' as const,
    retryLocations: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function renderPage(model = pageModel()): void {
  mocks.useFixturesPageModel.mockReturnValue(model);
  render(
    <MemoryRouter initialEntries={['/inventory/connections/fixtures']}>
      <Routes>
        <Route path="*" element={<FixturesPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useConnectionsTabCounts.mockReturnValue({ connections: 2, fixtures: 1 });
});

describe('FixturesPage', () => {
  it('keeps draft filters responsive, opens edit, and navigates to detail', () => {
    const model = pageModel();
    renderPage(model);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter by fixture or wired item' }), {
      target: { value: 'desk' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), {
      target: { value: 'light' },
    });
    expect(model.filters.setQueryDraft).toHaveBeenCalledWith('desk');
    expect(model.filters.setKindDraft).toHaveBeenCalledWith('light');
    expect(screen.getByRole('tab', { name: /Connections\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Fixtures\s*1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Desk outlet' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit Desk outlet');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Desk outlet' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/fixtures/fixture-1');
  });

  it('shows stale and offline states and refuses new writes while offline', () => {
    const changed = { stale: true, groups: [{}], reload: vi.fn() };
    const model = pageModel({ online: false, changed });
    renderPage(model);

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(
      screen.queryByText('Fixtures changed elsewhere since this page loaded')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New fixture' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New fixture' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('uses the first-use empty state action and a retryable error state', () => {
    const empty = pageModel({
      fixtures: {
        rows: [],
        total: 0,
        status: 'success' as const,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      },
      unfilteredTotal: 0,
    });
    renderPage(empty);
    const emptyActions = screen.getAllByRole('button', { name: 'New fixture' });
    const emptyAction = emptyActions.at(-1);
    if (emptyAction === undefined) throw new Error('empty fixture action missing');
    fireEvent.click(emptyAction);
    expect(screen.getByRole('dialog')).toHaveTextContent('New fixture');

    const retry = vi.fn();
    const errored = pageModel({
      fixtures: {
        rows: [],
        total: null,
        status: 'error' as const,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: retry,
      },
      hasLoaded: false,
      status: 'error' as const,
      retry,
    });
    mocks.useFixturesPageModel.mockReturnValue(errored);
    render(
      <MemoryRouter initialEntries={['/inventory/connections/fixtures']}>
        <Routes>
          <Route path="*" element={<FixturesPage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
