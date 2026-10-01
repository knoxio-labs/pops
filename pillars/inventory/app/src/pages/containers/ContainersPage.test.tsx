import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { ContainersPage } from './ContainersPage.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRows, WebItemsFilters } from '../../inventory-web/useWebItems.js';

const mocks = vi.hoisted(() => ({
  showUndoToast: vi.fn(),
  toastError: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  useCatalogueLookups: vi.fn(),
  useItemsExport: vi.fn(),
  useItemRows: vi.fn(),
  useListVerbs: vi.fn(),
  useOnline: vi.fn(),
  usePendingItemIds: vi.fn(),
  usePlacementSources: vi.fn(),
  useWebSummary: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));
vi.mock('../../foundation/list-page/use-export.js', () => ({
  useItemsExport: mocks.useItemsExport,
}));
vi.mock('../../foundation/list-page/use-list-verbs.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../foundation/list-page/use-list-verbs.js')>();
  return { ...actual, useListVerbs: mocks.useListVerbs };
});
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
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
vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

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

function catalogueType(
  key: string,
  label: string,
  options: Partial<
    Pick<CatalogueType, 'capabilities' | 'sortOrder' | 'archivedAt' | 'parentTypeId'>
  > = {}
): CatalogueType {
  return {
    id: `type-${key}`,
    key,
    label,
    sortOrder: options.sortOrder ?? 0,
    archivedAt: options.archivedAt ?? null,
    capabilities: options.capabilities ?? [],
    description: null,
    fields: [],
    legacyLabels: [],
    parentTypeId: options.parentTypeId ?? null,
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
let currentSummary: {
  data: WebSummaryGetResponse | undefined;
  status: 'pending' | 'error' | 'success';
  refetch: ReturnType<typeof vi.fn>;
} = { data: summary, status: 'success', refetch: vi.fn() };
let currentOnline = true;
let verbs: { setAccess: ReturnType<typeof vi.fn>; setLifecycle: ReturnType<typeof vi.fn> };

function listActions() {
  return [
    ['pick-up', 'Pick up', INVENTORY_ICONS.pickUp],
    ['move', 'Move', INVENTORY_ICONS.move],
    ['take-out', 'Take out', INVENTORY_ICONS.takeOut],
    ['label', 'Print labels', INVENTORY_ICONS.label],
    ['set-type', 'Set type', INVENTORY_ICONS.type],
    ['set-field', 'Set field', INVENTORY_ICONS.computed],
    ['retire', 'Retire', INVENTORY_ICONS.retired],
    ['discard', 'Discard', INVENTORY_ICONS.discarded],
    ['export', 'Export selected as CSV', INVENTORY_ICONS.label],
    ['copy-codes', 'Copy codes', INVENTORY_ICONS.code],
  ].map(([id, label, icon]) => ({ id, label, icon, onSelect: vi.fn() }));
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function LocationProbe(): ReactElement {
  const locationState = useLocation();
  return <output data-testid="location">{locationState.pathname + locationState.search}</output>;
}

function LocationStateProbe(): ReactElement {
  return <output data-testid="location-state">{JSON.stringify(useLocation().state)}</output>;
}

function renderPage(initialEntry = '/inventory/containers'): void {
  mocks.useItemRows.mockImplementation((_query: WebItemsFilters) => currentRows);
  mocks.useCatalogueLookups.mockReturnValue({
    catalogue: undefined,
    types: [
      catalogueType('storage', 'Storage'),
      catalogueType('box', 'Box', { capabilities: ['containment'], sortOrder: 1 }),
      catalogueType('box-lid', 'Box lid', { parentTypeId: 'type-box', sortOrder: 2 }),
    ],
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
    setAccess: vi.fn().mockResolvedValue({
      applied: ['box-open'],
      refused: [],
      undo: async () => undefined,
    }),
    setLifecycle: vi.fn().mockResolvedValue({ applied: ['box-open'], refused: [], undo: null }),
  };
  mocks.useBulkItemVerbs.mockReturnValue(verbs);
  mocks.useItemsExport.mockReturnValue({
    busy: false,
    exportSelection: vi.fn(),
    exportTemplate: vi.fn(),
    exportView: vi.fn(),
  });
  mocks.useListVerbs.mockImplementation(
    (input: {
      contentCounts: Readonly<Record<string, { deep: number }>>;
      tracked: { rejections: Readonly<Record<string, string>>; track: unknown };
    }) => ({
      actions: listActions(),
      carried: input.contentCounts['box-open']?.deep ?? 0,
      dockAnchorRef: { current: null },
      keyHandlers: {},
      onRowVerb: vi.fn(),
      overlays: null,
      rejections: input.tracked.rejections,
      track: input.tracked.track,
    })
  );
  mocks.webList.mockResolvedValue(
    ok({
      contentCounts: {},
      hiddenInactiveCount: 0,
      items: [{ id: 'box-closed' }],
      nextCursor: null,
      total: 1,
      unfilteredTotal: 1,
    })
  );

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<ContainersPage />} />
        </Routes>
        <LocationProbe />
        <LocationStateProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentRows = rowsResult([openBox, closedBox]);
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

  it('offers effective containment types and places in the container filters', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    const typeOptions = [...screen.getByLabelText('Type').querySelectorAll('option')].map(
      (option) => option.textContent
    );
    const placeOptions = [...screen.getByLabelText('Where').querySelectorAll('option')].map(
      (option) => option.textContent
    );
    expect(typeOptions).toEqual(['Any type', 'Box', 'Box › Box lid']);
    expect(placeOptions).toEqual(['Anywhere', 'Garage']);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'box-lid' } });
    await waitFor(() =>
      expect(mocks.useItemRows.mock.calls.some(([query]) => query.typeKey === 'box-lid')).toBe(true)
    );
  });

  it('changes the URL-backed state segment and sends the server filter', async () => {
    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Closed1' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/containers?state=closed')
    );
    await waitFor(() =>
      expect(mocks.useItemRows.mock.calls.some(([query]) => query.access === 'closed')).toBe(true)
    );
  });

  it('shows moving-day packing progress and prints the server returned closed ids', async () => {
    const returnedClosedIds = Array.from(
      { length: MAX_LABEL_IDS + 5 },
      (_, index) => `closed-${String(index)}`
    );
    renderPage('/inventory/containers?state=moving');

    expect(screen.getByText('of 2 closed')).toBeInTheDocument();
    mocks.webList.mockResolvedValueOnce(
      ok({
        contentCounts: {},
        hiddenInactiveCount: 0,
        items: returnedClosedIds.map((id) => ({ id })),
        nextCursor: null,
        total: returnedClosedIds.length,
        unfilteredTotal: returnedClosedIds.length,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Print labels for 1 closed' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/labels')
    );
    const search = screen.getByTestId('location').textContent?.split('?')[1] ?? '';
    expect(new URLSearchParams(search).get('ids')?.split(',')).toEqual(
      returnedClosedIds.slice(0, MAX_LABEL_IDS)
    );
    expect(mocks.webList).toHaveBeenCalledWith({
      query: { isContainer: 'true', access: 'closed', limit: MAX_LABEL_IDS },
    });
  });

  it('disables moving-day labels above the route limit and fetches nothing', () => {
    const closedCount = MAX_LABEL_IDS + 1;
    currentRows = rowsResult([closedBox]);
    currentSummary = {
      data: { ...summary, packing: { ...summary.packing, closed: closedCount } },
      status: 'success',
      refetch: vi.fn(),
    };
    renderPage('/inventory/containers?state=moving');

    expect(screen.getByText(`of ${String(closedCount + 1)} closed`)).toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: `Print labels for ${String(closedCount)} closed`,
    });
    expect(button).toBeDisabled();
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('disables Print labels while the closed-container request is pending', async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    renderPage('/inventory/containers?state=moving');
    mocks.webList.mockReturnValueOnce(request);

    fireEvent.click(screen.getByRole('button', { name: 'Print labels for 1 closed' }));

    const loadingButton = screen.getByRole('button', { name: 'Loading labels' });
    expect(loadingButton).toBeDisabled();
    fireEvent.click(loadingButton);
    expect(mocks.webList).toHaveBeenCalledOnce();

    resolveRequest(
      ok({
        contentCounts: {},
        hiddenInactiveCount: 0,
        items: [{ id: 'box-closed' }],
        nextCursor: null,
        total: 1,
        unfilteredTotal: 1,
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/labels')
    );
  });

  it('keeps the Containers page when the closed-container request fails', async () => {
    renderPage('/inventory/containers?state=moving');
    mocks.webList.mockRejectedValueOnce(new Error('offline'));

    fireEvent.click(screen.getByRole('button', { name: 'Print labels for 1 closed' }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Labels did not open. The inventory service did not answer.'
      )
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/containers?state=moving');
    expect(screen.getByRole('button', { name: 'Print labels for 1 closed' })).not.toBeDisabled();
  });

  it('clicking a row opens the item with the Containers list trail', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Open Closed box' }));

    expect(JSON.parse(screen.getByTestId('location-state').textContent ?? '')).toEqual({
      listTrail: {
        listName: 'Containers',
        href: '/inventory/containers',
        ids: ['box-open', 'box-closed'],
      },
    });
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

  it('shows the number of items carried by selected containers', () => {
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Open box' }));

    expect(screen.getByText('1 selected, 3 inside')).toBeInTheDocument();
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
    [
      'a conflict',
      {
        status: 'conflict' as const,
        kind: 'deleted' as const,
        mutationId: 'mutation-1',
        at: '2026-09-27T00:00:00.000Z',
        source: { kind: 'web', label: 'Web' },
      },
      'Changed elsewhere since it loaded.',
    ],
    [
      'a deferred mutation',
      { status: 'deferred' as const, mutationId: 'mutation-1', waitingOn: 'mutation-0' },
      'Waiting on another change.',
    ],
  ])('shows the shared refusal reason for %s', async (_name, outcome, message) => {
    renderPage();
    verbs.setAccess.mockResolvedValue({
      applied: [],
      refused: [{ id: 'box-open', refusal: { kind: 'outcome', outcome } }],
      undo: null,
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Open box' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not saved. ${message}`);
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
    renderPage('/inventory/containers?state=closed');
    expect(screen.getByText('No containers match these filters')).toBeInTheDocument();
  });

  it('uses the empty inventory state when the summary failed before any container existed', () => {
    currentRows = rowsResult([], { total: 0, unfilteredTotal: 0 });
    currentSummary = { data: undefined, status: 'error', refetch: vi.fn() };
    renderPage();

    expect(screen.getByText('No containers yet')).toBeInTheDocument();
  });

  it('uses the filtered empty state when the summary fails with an active filter', () => {
    currentRows = rowsResult([], { total: 0, unfilteredTotal: 0 });
    currentSummary = { data: undefined, status: 'error', refetch: vi.fn() };
    renderPage('/inventory/containers?type=box');

    expect(screen.getByText('No containers match these filters')).toBeInTheDocument();
  });

  it('shows inactive containers omitted from the server result', () => {
    currentRows = rowsResult([openBox, closedBox], { hiddenInactiveCount: 2 });
    renderPage();

    expect(screen.getByText('2 containers, 2 inactive not shown')).toBeInTheDocument();
  });

  it('routes New container to the first published containment type', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New container' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/new?type=box');
  });
});
