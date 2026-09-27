import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { InventoryTopbarDropdown } from './topbar-provider.js';

import type { Mock } from 'vitest';

import type { SearchDropdownProps } from '@pops/navigation';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseHit } from '../../inventory-web/purchase-model.js';
import type { RecentRecord } from '../../inventory-web/recents.js';
import type { WebSearchResults } from '../../inventory-web/useWebSearch.js';

const mocks = vi.hoisted(() => ({
  useWebSearch: vi.fn(),
  usePurchasesSearch: vi.fn(),
  useRecents: vi.fn(),
  usePlacementSources: vi.fn(),
  recordQuery: vi.fn(),
  recordOpened: vi.fn(),
}));

vi.mock('../../inventory-web/useWebSearch.js', () => ({
  useWebSearch: mocks.useWebSearch,
}));

vi.mock('../../inventory-web/usePurchasesSearch.js', () => ({
  usePurchasesSearch: mocks.usePurchasesSearch,
}));

vi.mock('../../inventory-web/recents.js', () => ({
  useRecents: mocks.useRecents,
  recordQuery: mocks.recordQuery,
  recordOpened: mocks.recordOpened,
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));

vi.mock('../../inventory-web/purchase-model.js', () => ({
  purchaseHref: (id: string) => `/purchases/${id}`,
}));

const emptyResults: WebSearchResults = {
  exact: null,
  items: [],
  places: [],
  total: 0,
};

const emptyPurchaseState = {
  hits: [],
  status: 'success' as const,
  error: null,
};

type HarnessState = {
  lastResult: boolean;
  close: Mock<SearchDropdownProps['close']>;
  setQuery: Mock<SearchDropdownProps['setQuery']>;
  setActiveDescendant: Mock<SearchDropdownProps['setActiveDescendant']>;
};

function createHarnessState(): HarnessState {
  return {
    lastResult: false,
    close: vi.fn<SearchDropdownProps['close']>(),
    setQuery: vi.fn<SearchDropdownProps['setQuery']>(),
    setActiveDescendant: vi.fn<SearchDropdownProps['setActiveDescendant']>(),
  };
}

let harnessState = createHarnessState();

function item(id: string, name = id, code: string | null = null): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function location(id: string, name = id, parentId: string | null = null): LocationModel {
  return { id, name, parentId, kind: 'room' };
}

function purchase(id: string, orderNumber: string | null, matchedLine: string | null): PurchaseHit {
  return {
    id,
    merchant: 'Store',
    orderNumber,
    date: '2026-01-01T00:00:00.000Z',
    totalCents: 1250,
    currency: 'AUD',
    matchedLine,
  };
}

function LocationDisplay() {
  const current = useLocation();
  return <div data-testid="location">{current.pathname + current.search}</div>;
}

function Harness({
  query,
  inputValue = query,
  onRef,
}: {
  query: string;
  inputValue?: string;
  onRef?: (ref: SearchDropdownProps['keyHandlerRef'] | null) => void;
}) {
  const keyHandlerRef = useRef<SearchDropdownProps['keyHandlerRef']['current']>(null);
  useEffect(() => {
    if (onRef === undefined) return;
    onRef(keyHandlerRef);
    return () => onRef(null);
  }, [onRef]);
  return (
    <>
      <input
        data-testid="topbar-input"
        defaultValue={inputValue}
        onKeyDown={(event) => {
          harnessState.lastResult = keyHandlerRef.current?.(event) ?? false;
        }}
      />
      <InventoryTopbarDropdown
        query={query}
        listboxId="global-search-listbox"
        setQuery={harnessState.setQuery}
        close={harnessState.close}
        keyHandlerRef={keyHandlerRef}
        setActiveDescendant={harnessState.setActiveDescendant}
      />
      <LocationDisplay />
    </>
  );
}

function renderDropdown(query: string, inputValue = query) {
  return render(
    <MemoryRouter initialEntries={['/inventory']}>
      <Harness query={query} inputValue={inputValue} />
    </MemoryRouter>
  );
}

function setInventoryResults(results: WebSearchResults): void {
  mocks.useWebSearch.mockReturnValue({
    results,
    status: results.total === 0 ? 'success' : 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });
}

function setRecents(records: RecentRecord[] = [], queries: string[] = []): void {
  mocks.useRecents.mockReturnValue({ queries, records, placements: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  harnessState = createHarnessState();
  setInventoryResults(emptyResults);
  mocks.usePurchasesSearch.mockReturnValue(emptyPurchaseState);
  setRecents();
  mocks.usePlacementSources.mockReturnValue({ world: buildWorld([], []) });
});

describe('InventoryTopbarDropdown', () => {
  it('searches the query prop at once with no debounce of its own', () => {
    renderDropdown('cable');

    expect(mocks.useWebSearch).toHaveBeenCalledWith({ q: 'cable', limit: 8 });
    expect(mocks.usePurchasesSearch).toHaveBeenCalledWith('cable');
  });

  it('lists up to eight rows in page order with the exact code first and counts both scopes', () => {
    const exact = item('k12', 'Kitchen 12', 'k12');
    const prefix = item('cable', 'Cable tub');
    const results: WebSearchResults = {
      exact,
      items: [
        { kind: 'item', item: prefix, tier: 'prefix', field: null },
        { kind: 'item', item: item('note'), tier: 'other', field: 'note' },
      ],
      places: [{ kind: 'place', place: location('garage', 'Garage'), tier: 'contains' }],
      total: 4,
    };
    setInventoryResults(results);
    const purchaseHits = [
      purchase('purchase-1', 'A-1', null),
      purchase('purchase-2', null, 'Cable'),
    ];
    mocks.usePurchasesSearch.mockReturnValue({ ...emptyPurchaseState, hits: purchaseHits });

    renderDropdown('cable');

    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Kitchen 12');
    expect(rows[0]).toHaveTextContent('Exact code');
    expect(screen.getByRole('radiogroup', { name: 'Search in' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Inventory/ })).toHaveTextContent('4');
    expect(screen.getByRole('radio', { name: /Purchases/ })).toHaveTextContent('2');
  });

  it('no row is active until ArrowDown, and the active option id reaches setActiveDescendant', () => {
    setInventoryResults({
      ...emptyResults,
      items: [{ kind: 'item', item: item('one'), tier: 'prefix', field: null }],
      total: 1,
    });
    renderDropdown('one');

    const [row] = screen.getAllByRole('option');
    expect(row).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'ArrowDown' });

    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(harnessState.setActiveDescendant).toHaveBeenLastCalledWith(
      'global-search-listbox-option-0'
    );
  });

  it('Enter on an active row opens it and records it', () => {
    const exact = item('k12', 'Kitchen 12', 'k12');
    setInventoryResults({ ...emptyResults, exact, total: 1 });
    renderDropdown('k12');
    const input = screen.getByTestId('topbar-input');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/k12');
    expect(mocks.recordOpened).toHaveBeenCalledWith({ kind: 'item', id: 'k12' });
    expect(mocks.recordQuery).toHaveBeenCalledWith('k12');
    expect(harnessState.close).toHaveBeenCalledOnce();
  });

  it('Enter with no active row opens the search page with the query', () => {
    renderDropdown('cable');
    const input = screen.getByTestId('topbar-input');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(harnessState.lastResult).toBe(true);
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/search?q=cable');
    expect(mocks.recordQuery).toHaveBeenCalledWith('cable');
  });

  it('Enter with no active row uses the box text even before the debounced query catches up', () => {
    const firstView = renderDropdown('cab', 'cable');
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/search?q=cable');
    expect(mocks.recordQuery).toHaveBeenCalledWith('cable');

    firstView.unmount();
    renderDropdown('', 'cable');
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/search?q=cable');
  });

  it('Esc calls close and returns true', () => {
    renderDropdown('cable');
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'Escape' });

    expect(harnessState.lastResult).toBe(true);
    expect(harnessState.close).toHaveBeenCalledOnce();
  });

  it('Tab switches to Purchases and lists purchase rows', () => {
    mocks.usePurchasesSearch.mockReturnValue({
      ...emptyPurchaseState,
      hits: [purchase('purchase-1', null, 'Cable')],
    });
    setInventoryResults({ ...emptyResults, total: 2 });
    renderDropdown('cable');

    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'Tab' });

    expect(screen.getByRole('radio', { name: /Purchases/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('option')).toHaveTextContent('Store Cable');
  });

  it('a click on the Purchases chip switches to Purchases and resets the active row', () => {
    setInventoryResults({
      ...emptyResults,
      items: [{ kind: 'item', item: item('one'), tier: 'prefix', field: null }],
      total: 1,
    });
    mocks.usePurchasesSearch.mockReturnValue({
      ...emptyPurchaseState,
      hits: [purchase('purchase-1', 'A-1', null)],
    });
    renderDropdown('cable');
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'ArrowDown' });
    harnessState.setActiveDescendant.mockClear();

    fireEvent.click(screen.getByRole('radio', { name: /Purchases/ }));

    expect(screen.getByRole('radio', { name: /Purchases/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('option')).toHaveTextContent('Store A-1');
    expect(harnessState.setActiveDescendant).toHaveBeenLastCalledWith(undefined);
  });

  it('Shift-Tab is not handled and does not switch scope', () => {
    renderDropdown('cable');
    for (const modifiers of [
      { shiftKey: true },
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
    ]) {
      fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'Tab', ...modifiers });
      expect(harnessState.lastResult).toBe(false);
      expect(screen.getByRole('radio', { name: /Inventory/ })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    }
  });

  it('an empty box lists three recent queries and the recent records, and choosing a query calls setQuery', () => {
    const recentItem = item('recent-item', 'Recent item');
    const recentPlace = location('recent-place', 'Recent place');
    const world: PlacementWorld = buildWorld([recentItem], [recentPlace]);
    mocks.usePlacementSources.mockReturnValue({ world });
    setRecents(
      [
        { kind: 'item', id: recentItem.id },
        { kind: 'location', id: recentPlace.id },
      ],
      ['one', 'two', 'three', 'four']
    );
    renderDropdown('');

    expect(screen.getByText('Recent searches')).toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
    expect(screen.queryByText('four')).not.toBeInTheDocument();
    expect(screen.getByText('Recently opened')).toBeInTheDocument();
    expect(screen.getByText('Recent item')).toBeInTheDocument();
    expect(screen.getAllByText('Recent place').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('two'));
    expect(harnessState.setQuery).toHaveBeenCalledWith('two');
  });

  it('unmounting clears keyHandlerRef and the active descendant', () => {
    setInventoryResults({
      ...emptyResults,
      items: [{ kind: 'item', item: item('one'), tier: 'prefix', field: null }],
      total: 1,
    });
    const onRef = vi.fn<(ref: SearchDropdownProps['keyHandlerRef'] | null) => void>();
    const view = render(
      <MemoryRouter initialEntries={['/inventory']}>
        <Harness query="one" onRef={onRef} />
      </MemoryRouter>
    );
    fireEvent.keyDown(screen.getByTestId('topbar-input'), { key: 'ArrowDown' });
    harnessState.setActiveDescendant.mockClear();
    const ref = onRef.mock.calls[0]?.[0];
    expect(ref?.current).not.toBeNull();

    view.unmount();

    expect(ref?.current).toBeNull();
    expect(harnessState.setActiveDescendant).toHaveBeenLastCalledWith(undefined);
  });
});
