import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import * as csv from '../../foundation/list-page/inventory-csv';
import { buildWorld } from '../../foundation/model/placement-model';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider';
import { ExportMenu } from './export-menu';
import { ItemsPage } from './items-page';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups';
import type { ItemRows } from '../../inventory-web/useWebItems';

const mocks = vi.hoisted(() => ({
  useItemRows: vi.fn(),
  useCatalogueLookups: vi.fn(),
  usePlacementSources: vi.fn(),
  usePendingItemIds: vi.fn(),
  useItemVerbs: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  useChangedElsewhere: vi.fn(),
  useOnline: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../../inventory-web/useWebItems', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/item-verbs', () => ({
  usePendingItemIds: mocks.usePendingItemIds,
  useItemVerbs: mocks.useItemVerbs,
}));
vi.mock('../../inventory-web/item-verbs-bulk', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/useChangedElsewhere', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

const location = { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const };

const activeRow: ItemRowModel = {
  id: 'item-1',
  name: 'Kitchen 13',
  typeId: 'type-cable',
  typeName: 'Cable',
  code: 'K13',
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'location', locationId: location.id },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const originalIntersectionObserver = globalThis.IntersectionObserver;
const observers: TestIntersectionObserver[] = [];

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private readonly callback: IntersectionObserverCallback;
  private target: Element | null = null;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root instanceof Element ? options.root : null;
    observers.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(target: Element): void {
    if (this.target === target) this.target = null;
  }

  disconnect(): void {
    this.target = null;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(): void {
    if (this.target === null) return;
    const bounds = this.target.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      boundingClientRect: bounds,
      intersectionRatio: 1,
      intersectionRect: bounds,
      isIntersecting: true,
      rootBounds: null,
      target: this.target,
      time: 0,
    };
    this.callback([entry], this);
  }
}

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

function rowsResult(overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows: [activeRow],
    total: 1,
    unfilteredTotal: 1,
    hiddenInactiveCount: 0,
    baseline: 1,
    hidden: 0,
    contentCounts: {},
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

let currentRows = rowsResult();
let currentOnline = true;
let currentChanged: {
  groups: { entityCount: number }[];
  stale: boolean;
  reload: () => void;
} = { groups: [], stale: false, reload: vi.fn() };

function LocationProbe(): ReactElement {
  return <output data-testid="location">{useLocation().search + useLocation().pathname}</output>;
}

function LocationStateProbe(): ReactElement {
  return <output data-testid="location-state">{JSON.stringify(useLocation().state)}</output>;
}

function renderPage(initialEntry = '/inventory/items'): void {
  mocks.useItemRows.mockImplementation(() => currentRows);
  mocks.useOnline.mockImplementation(() => currentOnline);
  mocks.useChangedElsewhere.mockImplementation(() => currentChanged);
  mocks.usePendingItemIds.mockImplementation(() => new Set<string>());
  mocks.useItemVerbs.mockImplementation(() => ({
    pickUp: vi.fn(),
    move: vi.fn(),
    putBack: vi.fn(),
  }));
  mocks.useBulkItemVerbs.mockImplementation(() => ({
    pickUp: vi.fn(),
    move: vi.fn(),
  }));
  mocks.useCatalogueLookups.mockImplementation(() => ({
    catalogue: undefined,
    types: [catalogueType('cable', 'Cable')],
    typeById: new Map(),
    typeNameById: new Map(),
    typeForId: () => null,
    typeNameForId: () => null,
    isPending: false,
    error: null,
  }));
  mocks.usePlacementSources.mockImplementation(() => ({
    world: buildWorld([activeRow], [location]),
    recents: [],
    createLocation: { mutate: vi.fn() },
  }));

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<ItemsPage />} />
        </Routes>
        <LocationProbe />
        <LocationStateProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(csv, 'downloadCsv').mockImplementation(() => undefined);
  vi.useFakeTimers();
  observers.length = 0;
  globalThis.IntersectionObserver = TestIntersectionObserver;
  currentRows = rowsResult();
  currentOnline = true;
  currentChanged = { groups: [], stale: false, reload: vi.fn() };
});

afterEach(() => {
  if (originalIntersectionObserver === undefined) {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
  vi.useRealTimers();
});

describe('ItemsPage', () => {
  it('Export offers the view, the selection and the template with their counts', () => {
    currentRows = rowsResult({ total: 12 });
    renderPage();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export' }), {
      button: 0,
      pointerType: 'mouse',
    });

    expect(screen.getByRole('menuitem', { name: /This view as CSV/u })).toHaveTextContent(
      "12 rows, as filtered now. Every column, plus each type's fields."
    );
    expect(screen.getByRole('menuitem', { name: /Selected rows as CSV/u })).toHaveTextContent(
      'Select rows first.'
    );
    expect(screen.getByRole('menuitem', { name: /Selected rows as CSV/u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: /Import template/u })).toHaveTextContent(
      'An empty CSV with the columns Import reads.'
    );
  });

  it('This view as CSV is disabled until the list total arrives', () => {
    currentRows = rowsResult({ total: null, status: 'pending' });
    renderPage();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export' }), {
      button: 0,
      pointerType: 'mouse',
    });

    expect(screen.getByRole('menuitem', { name: /This view as CSV/u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('disables every export choice while placement data is loading', () => {
    render(
      <ExportMenu
        viewCount={12}
        selectedCount={1}
        busy
        onView={vi.fn()}
        onSelection={vi.fn()}
        onTemplate={vi.fn()}
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export' }), {
      button: 0,
      pointerType: 'mouse',
    });

    expect(screen.getByRole('menuitem', { name: /This view as CSV/u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: /Selected rows as CSV/u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: /Import template/u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('the selection bar offers Export selected as CSV', async () => {
    mocks.webList.mockResolvedValue({
      data: {
        contentCounts: {},
        hiddenInactiveCount: 0,
        items: [],
        nextCursor: null,
        total: 0,
        unfilteredTotal: 0,
      },
      error: undefined,
      response: { status: 200 },
    });
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Kitchen 13' }));
    expect(screen.getByRole('button', { name: /Set type/u })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for the selection' }), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(screen.getByRole('menuitem', { name: 'Retire' })).toBeInTheDocument();
    const exportAction = screen.getByRole('menuitem', { name: 'Export selected as CSV' });
    expect(exportAction).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(exportAction);
      await Promise.resolve();
    });

    expect(mocks.webList).toHaveBeenCalledWith({
      query: { ids: 'item-1', includeInactive: true, limit: WEB_ITEMS_MAX_IDS },
    });
    expect(csv.downloadCsv).toHaveBeenCalled();
  });

  it('renders the table with the server total and the hidden inactive count', () => {
    currentRows = rowsResult({ total: 12, unfilteredTotal: 40, hiddenInactiveCount: 3 });
    renderPage();

    expect(screen.getByText('12 of 40 items, 3 inactive not shown')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'items' })).toBeInTheDocument();
  });

  it('a type chosen in the filter reaches the query after 150ms and shows a chip', async () => {
    currentRows = rowsResult({ total: 12, unfilteredTotal: 40 });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Filter/u }));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'cable' } });

    expect(screen.getByTestId('location')).toHaveTextContent('?type=cable/inventory/items');
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mocks.useItemRows.mock.calls.at(-1)?.[0]).toMatchObject({ typeKey: 'cable' });
    expect(screen.getByText('Type: Cable')).toBeInTheDocument();
  });

  it('typing a full code sends it as q and lists the item', async () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Filter this list' });
    fireEvent.change(input, { target: { value: 'K13' } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mocks.useItemRows.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'K13' });
    expect(screen.getByText('Kitchen 13')).toBeInTheDocument();
  });

  it('cards view loads the next page from the footer button', () => {
    const fetchNextPage = vi.fn();
    currentRows = rowsResult({ total: 3, fetchNextPage });
    renderPage('/inventory/items?view=cards');

    fireEvent.click(screen.getByRole('button', { name: 'Load 2 more' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('the table footer loads the next page', () => {
    const fetchNextPage = vi.fn();
    currentRows = rowsResult({ total: 3, fetchNextPage });
    renderPage();

    const observer = observers.at(-1);
    if (observer === undefined) throw new Error('The table footer observer was not created');
    act(() => observer.trigger());
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('compact view renders 32px rows', () => {
    renderPage('/inventory/items?view=compact');

    const row = screen.getByRole('grid', { name: 'items' }).querySelector('[role="row"] > div');
    expect(row).toHaveClass('h-8');
  });

  it('an empty inventory offers New item, Bulk entry and Import CSV', () => {
    currentRows = rowsResult({ rows: [], total: 0, unfilteredTotal: 0 });
    renderPage();

    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulk entry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });

  it('only inactive items left shows empty-filtered, not the empty inventory', () => {
    currentRows = rowsResult({ rows: [], total: 0, unfilteredTotal: 0, hiddenInactiveCount: 3 });
    renderPage();

    expect(screen.getByText('No items match these filters')).toBeInTheDocument();
    expect(screen.queryByText('No items yet')).not.toBeInTheDocument();
  });

  it('only inactive items left still offers the Include inactive filter', () => {
    currentRows = rowsResult({ rows: [], total: 0, unfilteredTotal: 0, hiddenInactiveCount: 3 });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Filter/u }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Include retired, discarded, lost and destroyed' })
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('location')).toHaveTextContent('?inactive=1/inventory/items');
    expect(mocks.useItemRows.mock.calls.at(-1)?.[0]).toMatchObject({ includeInactive: true });
  });

  it('a filter matching nothing while only inactive items exist keeps the toolbar and shows empty-filtered', () => {
    currentRows = rowsResult({ rows: [], total: 0, unfilteredTotal: 0, hiddenInactiveCount: 0 });
    renderPage('/inventory/items?q=drill');

    expect(screen.getByRole('textbox', { name: 'Filter this list' })).toHaveValue('drill');
    expect(screen.getByText('No items match these filters')).toBeInTheDocument();
    expect(screen.queryByText('No items yet')).not.toBeInTheDocument();
  });

  it('Clear filters in the empty body clears the text as well', () => {
    currentRows = rowsResult({ rows: [], total: 0, unfilteredTotal: 40 });
    renderPage('/inventory/items?q=snorkel&view=cards');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByTestId('location')).toHaveTextContent('?view=cards/inventory/items');
  });

  it('Compare both sets q to the duplicate name and Dismiss hides the banner', () => {
    const duplicateRows = [
      { ...activeRow, name: 'Extension lead', code: 'EXT-1' },
      { ...activeRow, id: 'item-2', name: ' extension lead ', code: null },
    ];
    currentRows = rowsResult({ rows: duplicateRows });
    mocks.usePlacementSources.mockImplementation(() => ({
      world: buildWorld(duplicateRows, [location]),
      recents: [],
      createLocation: { mutate: vi.fn() },
    }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Compare both' }));
    expect(screen.getByTestId('location')).toHaveTextContent('?q=Extension+lead/inventory/items');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      screen.queryByText('Two items called Extension lead sit on Garage')
    ).not.toBeInTheDocument();
  });

  it('a failed read shows the error and Retry refetches', () => {
    const refetch = vi.fn();
    currentRows = rowsResult({ status: 'error', refetch });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Items did not load')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('offline shows the banner and disables New item', () => {
    currentOnline = false;
    renderPage();
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New item' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('the stale banner Reload calls reload and the rows stay until then', () => {
    const reload = vi.fn();
    currentChanged = {
      groups: [{ entityCount: 2 }],
      stale: true,
      reload,
    };
    renderPage();

    expect(
      screen.getByText('2 items changed elsewhere since this list loaded')
    ).toBeInTheDocument();
    expect(screen.getByText('Kitchen 13')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByText('Kitchen 13')).toBeInTheDocument();
  });

  it('Enter opens the focused row from the grid and not from a toolbar button', async () => {
    renderPage();
    const grid = screen.getByRole('grid', { name: 'items' });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'j' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/item-1');
  });

  it('clicking a row opens the item with the Items list trail', () => {
    const rows = [
      activeRow,
      { ...activeRow, id: 'item-2', name: 'Kitchen 14' },
      { ...activeRow, id: 'item-3', name: 'Kitchen 15' },
    ];
    currentRows = rowsResult({ rows });
    renderPage('/inventory/items?q=lead');

    fireEvent.click(screen.getByRole('button', { name: 'Open Kitchen 14' }));

    expect(JSON.parse(screen.getByTestId('location-state').textContent ?? '')).toEqual({
      listTrail: {
        listName: 'Items',
        href: '/inventory/items?q=lead',
        ids: ['item-1', 'item-2', 'item-3'],
      },
    });
  });

  it('Escape with rows ticked clears them; with none it leaves the input to the global dismiss', () => {
    renderPage();
    const checkbox = screen.getByRole('checkbox', { name: 'Select Kitchen 13' });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(checkbox).not.toBeChecked();

    const input = screen.getByRole('textbox', { name: 'Filter this list' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveFocus();
  });
});
