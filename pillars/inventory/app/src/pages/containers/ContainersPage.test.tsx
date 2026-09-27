import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { ContainersPage } from './ContainersPage.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRows, WebItemsFilters } from '../../inventory-web/useWebItems.js';

const mocks = vi.hoisted(() => ({
  useBulkItemVerbs: vi.fn(),
  useCatalogueLookups: vi.fn(),
  useItemRows: vi.fn(),
  useOnline: vi.fn(),
  usePendingItemIds: vi.fn(),
  usePlacementSources: vi.fn(),
  useWebSummary: vi.fn(),
}));

vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/useWebItems.js', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/item-verbs.js', () => ({
  usePendingItemIds: mocks.usePendingItemIds,
}));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useWebSummary.js', () => ({ useWebSummary: mocks.useWebSummary }));

const location = { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const };

function row(id: string, name: string, overrides: Partial<ItemRowModel> = {}): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: { access: 'open', full: false },
    lifecycle: 'active',
    placement: { kind: 'location', locationId: location.id },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

const openBox = row('box-open', 'Open box');
const closedBox = row('box-closed', 'Closed box', {
  code: 'CLOSED-1',
  container: { access: 'closed', full: true },
});
const retiredBox = row('box-retired', 'Retired box', {
  lifecycle: 'retired',
  container: { access: 'closed', full: false },
});

function catalogueType(key: string, label: string): CatalogueType {
  return {
    id: `type-${key}`,
    key,
    label,
    sortOrder: 0,
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [],
    legacyLabels: [],
    presentation: {},
    replacedBy: null,
    revision: 1,
  };
}

function rowsResult(rows: ItemRowModel[], overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows,
    total: rows.length,
    unfilteredTotal: rows.length,
    hiddenInactiveCount: 0,
    baseline: rows.length,
    hidden: 0,
    contentCounts: {
      'box-open': { direct: 2, deep: 3 },
      'box-closed': { direct: 0, deep: 0 },
    },
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

const summary: WebSummaryGetResponse = {
  counts: { containers: 2, inHand: 0, items: 2, locations: 1, openContainers: 1, things: 2 },
  containerSegments: { all: 2, closed: 1, full: 1, moving: 2, open: 1, retired: 1 },
  packing: { closed: 1, fullButOpen: 0, open: 1, packedItems: 3 },
  moving: { closed: 1, full: 1, open: 1, packed: 3, total: 2 },
};

let currentRows = rowsResult([openBox, closedBox]);
let currentClosedRows = rowsResult([closedBox]);
let currentSummary: {
  data: WebSummaryGetResponse | undefined;
  status: 'pending' | 'error' | 'success';
  refetch: ReturnType<typeof vi.fn>;
} = { data: summary, status: 'success', refetch: vi.fn() };
let currentOnline = true;
let verbs: { setAccess: ReturnType<typeof vi.fn>; setLifecycle: ReturnType<typeof vi.fn> };

function LocationProbe(): ReactElement {
  const locationState = useLocation();
  return <output data-testid="location">{locationState.pathname + locationState.search}</output>;
}

function renderPage(initialEntry = '/inventory/containers'): void {
  mocks.useItemRows.mockImplementation((query: WebItemsFilters) =>
    query.access === 'closed' && query.sort === 'name' ? currentClosedRows : currentRows
  );
  mocks.useCatalogueLookups.mockReturnValue({
    catalogue: undefined,
    types: [catalogueType('storage', 'Storage')],
    typeById: new Map(),
    typeNameById: new Map(),
    typeForId: () => null,
    typeNameForId: () => null,
    isPending: false,
    error: null,
  });
  mocks.useOnline.mockReturnValue(currentOnline);
  mocks.usePendingItemIds.mockReturnValue(new Set<string>());
  mocks.usePlacementSources.mockReturnValue({
    world: buildWorld([openBox, closedBox, retiredBox], [location]),
  });
  mocks.useWebSummary.mockReturnValue(currentSummary);
  verbs = {
    setAccess: vi.fn().mockResolvedValue({ applied: ['box-open'], refused: [], undo: null }),
    setLifecycle: vi.fn().mockResolvedValue({ applied: ['box-open'], refused: [], undo: null }),
  };
  mocks.useBulkItemVerbs.mockReturnValue(verbs);

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<ContainersPage />} />
        </Routes>
        <LocationProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentRows = rowsResult([openBox, closedBox]);
  currentClosedRows = rowsResult([closedBox]);
  currentSummary = { data: summary, status: 'success', refetch: vi.fn() };
  currentOnline = true;
});

describe('ContainersPage', () => {
  it('uses server segment counts, server Holds counts, and the container toolbar', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: 'Open1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Closed1' })).toBeInTheDocument();
    expect(screen.getByText('2 containers')).toBeInTheDocument();
    expect(screen.getByText('2 things')).toBeInTheDocument();
    expect(screen.getByText(', 1 nested')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('Holds')).toBeInTheDocument();
  });

  it('changes the URL-backed state segment and sends the server filter', async () => {
    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Closed1' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/containers?state=closed')
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.useItemRows.mock.calls.some(([query]) => query.access === 'closed')).toBe(true);
  });

  it('shows moving-day packing progress and caps label ids at the route limit', () => {
    const manyClosed = Array.from({ length: 205 }, (_, index) =>
      row(`closed-${String(index)}`, `Closed ${String(index)}`, {
        container: { access: 'closed', full: false },
      })
    );
    currentRows = rowsResult(manyClosed);
    currentClosedRows = rowsResult(manyClosed);
    currentSummary = {
      data: { ...summary, packing: { ...summary.packing, closed: 205 } },
      status: 'success',
      refetch: vi.fn(),
    };
    renderPage('/inventory/containers?state=moving');

    expect(screen.getByText('of 206 closed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print labels for 200 of 205 closed' }));
    const params = new URLSearchParams(screen.getByTestId('location').textContent?.split('?')[1]);
    expect(params.get('ids')?.split(',')).toHaveLength(200);
  });

  it('uses the bulk access verb for selected containers and keeps it disabled offline', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Open box' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(verbs.setAccess).toHaveBeenCalledWith(['box-open'], 'closed');

    cleanup();
    currentOnline = false;
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Open box' }));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a row rejection when a bulk verb fails', async () => {
    renderPage();
    verbs.setAccess.mockRejectedValue(new Error('service unavailable'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Open box' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not saved. The inventory service did not answer.'
    );
  });

  it.each([
    ['loading', () => (currentRows = rowsResult([], { status: 'pending' }))],
    [
      'summary loading',
      () => (currentSummary = { data: undefined, status: 'pending', refetch: vi.fn() }),
    ],
  ])('renders the %s state', (_name, prepare) => {
    prepare();
    renderPage();
    expect(screen.getByLabelText('Loading containers')).toBeInTheDocument();
  });

  it('renders empty, offline, and error states with the expected actions', () => {
    currentRows = rowsResult([], { total: 0, unfilteredTotal: 0 });
    currentSummary = {
      data: { ...summary, containerSegments: { ...summary.containerSegments, all: 0, retired: 0 } },
      status: 'success',
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('No containers yet')).toBeInTheDocument();

    currentOnline = false;
    renderPage();
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();

    currentRows = rowsResult([], { status: 'error', refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('Containers did not load')).toBeInTheDocument();
  });

  it('uses the filtered empty state when a segment has no rows but containers exist elsewhere', () => {
    currentRows = rowsResult([], { total: 0, unfilteredTotal: 0 });
    currentClosedRows = rowsResult([], { total: 0, unfilteredTotal: 0 });
    renderPage('/inventory/containers?state=closed');
    expect(screen.getByText('No containers match these filters')).toBeInTheDocument();
  });
});
