import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { connectionRows } from './connection-model.js';
import { traceChain } from './connection-trace.js';
import { parseConnectionsUrl, writeConnectionsUrl } from './connections-url.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  connectItems: vi.fn(),
  connectFixture: vi.fn(),
  fetchNextPage: vi.fn(),
  reload: vi.fn(),
  retry: vi.fn(),
  showUndoToast: vi.fn(),
  toastError: vi.fn(),
  useConnectionsPageModel: vi.fn(),
}));

vi.mock('./connections-page-model.js', () => ({
  useConnectionsPageModel: (...args: unknown[]) => mocks.useConnectionsPageModel(...args),
}));
vi.mock('./connection-graph.js', () => ({
  ConnectionGraph: () => <div data-testid="connection-graph" />,
}));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { ConnectionsPage } from './ConnectionsPage.js';

function item(id: string, name: string): WebConnectionRow['item'] {
  return {
    code: null,
    id,
    isContainer: false,
    kind: 'item',
    lifecycle: 'active',
    name,
    typeKey: null,
  };
}

const rows: WebConnectionRow[] = [
  {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: item('item-b', 'Beta'),
    id: 'edge-1',
    item: item('item-a', 'Alpha'),
  },
  {
    createdAt: '2026-09-02T00:00:00.000Z',
    far: {
      id: 'fixture-1',
      kind: 'fixture',
      locationId: null,
      name: 'Outlet',
      type: 'power',
    },
    id: 'edge-2',
    item: item('item-a', 'Alpha'),
  },
];

function modelItem(row: WebConnectionRow['item']): ItemRowModel {
  return {
    id: row.id,
    name: row.name,
    typeId: null,
    typeName: null,
    code: row.code,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

let currentRows = rows;
let currentStatus: 'pending' | 'error' | 'success' = 'success';
let currentOnline = true;
let currentStale = false;
let currentHasNextPage = false;

const originalIntersectionObserver = globalThis.IntersectionObserver;
const observers: TestIntersectionObserver[] = [];

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private target: Element | null = null;

  constructor(private readonly callback: IntersectionObserverCallback) {
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

  trigger(isIntersecting = true): void {
    if (this.target === null) return;
    const bounds = this.target.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      boundingClientRect: bounds,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: bounds,
      isIntersecting,
      rootBounds: null,
      target: this.target,
      time: 0,
    };
    this.callback([entry], this);
  }
}

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function useFakePageModel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseConnectionsUrl(searchParams);
  const [queryDraft, setQueryDraft] = useState(url.q);
  const [kindDraft, setKindDraft] = useState(url.kind);
  const selection = useSelection(currentRows.map((row) => row.id));
  const itemModels = new Map<string, ItemRowModel>();
  for (const row of currentRows) {
    itemModels.set(row.item.id, modelItem(row.item));
    if (row.far.kind === 'item') itemModels.set(row.far.id, modelItem(row.far));
  }
  const world = buildWorld([...itemModels.values()], []);
  const resolvedRows = connectionRows(currentRows, world);
  const setTrace = (trace: string | null): void => {
    setSearchParams((current) => writeConnectionsUrl(current, { trace }), { replace: true });
  };
  const setView = (view: 'list' | 'graph'): void => {
    setSearchParams((current) => writeConnectionsUrl(current, { view }), { replace: true });
  };
  return {
    url,
    queryDraft,
    kindDraft,
    registry: {
      rows: currentRows,
      summary:
        currentStatus === 'error'
          ? null
          : { connections: currentRows.length, fixtures: 1, items: 2 },
      status: currentStatus,
      error: null,
      hasNextPage: currentHasNextPage,
      fetchNextPage: mocks.fetchNextPage,
      refetch: mocks.retry,
    },
    allConnections: { rows: currentRows, status: currentStatus, error: null },
    placement: { world, isLoading: false, isError: false },
    world,
    online: currentOnline,
    changed: { stale: currentStale, groups: [], reload: mocks.reload },
    selection,
    mutations: {
      disconnect: mocks.disconnect,
      connectItems: mocks.connectItems,
      connectFixture: mocks.connectFixture,
    },
    narrowed: url.q.trim() !== '' || url.kind !== 'all',
    total: currentStatus === 'success' ? currentRows.length : null,
    resolvedRows,
    resolvedAllRows: resolvedRows,
    initialLoading: currentStatus === 'pending',
    readError: currentStatus === 'error',
    registryFiltering: false,
    trace: url.trace === null ? null : traceChain(url.trace, resolvedRows, world),
    setQueryDraft,
    setKindDraft,
    setView,
    setTrace,
    clearFilters: () => {
      setQueryDraft('');
      setKindDraft('all');
      setSearchParams((current) => writeConnectionsUrl(current, { q: '', kind: 'all' }), {
        replace: true,
      });
    },
    retry: mocks.retry,
  };
}

function renderPage(initialEntry = '/inventory/connections'): void {
  mocks.useConnectionsPageModel.mockImplementation(useFakePageModel);
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<ConnectionsPage />} />
        </Routes>
        <LocationProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  observers.length = 0;
  globalThis.IntersectionObserver = TestIntersectionObserver;
  currentRows = rows;
  currentStatus = 'success';
  currentOnline = true;
  currentStale = false;
  currentHasNextPage = false;
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.connectItems.mockResolvedValue(undefined);
  mocks.connectFixture.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  if (originalIntersectionObserver === undefined) {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});

describe('ConnectionsPage', () => {
  it('renders the server-ordered ends, room/date columns, and only adds a next-page sentinel when needed', () => {
    renderPage();

    const rowsInGrid = screen.getAllByRole('row');
    expect(rowsInGrid.at(1)?.textContent).toContain('Alpha');
    expect(rowsInGrid.at(2)?.textContent).toContain('Outlet');
    expect(screen.getByText('1 Sept 2026')).toBeInTheDocument();
    expect(screen.queryByTestId('connections-sentinel')).not.toBeInTheDocument();

    cleanup();
    currentHasNextPage = true;
    renderPage();
    expect(screen.getByTestId('connections-sentinel')).toBeInTheDocument();
  });

  it('requests each next page once per loaded row count', () => {
    currentHasNextPage = true;
    renderPage();

    const observer = observers[0];
    if (observer === undefined) throw new Error('Expected a connections sentinel observer');
    observer.trigger();
    observer.trigger();

    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('writes trace and view changes through replace-style URL state', async () => {
    renderPage();

    const traceButtons = screen.getAllByRole('button', { name: 'Trace from Alpha' });
    const firstTraceButton = traceButtons[0];
    if (firstTraceButton === undefined) throw new Error('Expected a trace action');
    fireEvent.click(firstTraceButton);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?trace=item-a'));
    const traceTree = screen.getByRole('tree', { name: 'Reachable connection chain' });
    expect(traceTree).toBeInTheDocument();
    expect(within(traceTree).getByText('Beta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Graph' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('?trace=item-a&view=graph')
    );
    expect(screen.getByTestId('connection-graph')).toBeInTheDocument();
  });

  it('disconnects the clicked source row and offers one undo toast', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Alpha from Outlet' }));
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith(rows[1]));
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.showUndoToast).toHaveBeenCalledTimes(1);
    const offer = mocks.showUndoToast.mock.calls[0]?.[0];
    if (offer === undefined) throw new Error('Expected an undo offer');
    await offer.onUndo();
    expect(mocks.connectFixture).toHaveBeenCalledWith('item-a', 'fixture-1');
  });

  it('sends selected disconnects in row order and includes both item ends in labels', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Beta' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Outlet' }));
    expect(screen.getByRole('button', { name: 'Disconnect 2' })).not.toHaveAttribute(
      'aria-disabled'
    );
    expect(screen.getByRole('button', { name: 'Trace' })).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: /^Print labels/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/labels?ids=item-a%2Citem-b'
      )
    );

    cleanup();
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Beta' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Outlet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect 2' }));

    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(2));
    expect(mocks.disconnect).toHaveBeenNthCalledWith(1, rows[0]);
    expect(mocks.disconnect).toHaveBeenNthCalledWith(2, rows[1]);
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Disconnected 2 connections' })
    );
  });

  it('stops a disconnect batch at the first error and leaves undo unavailable', async () => {
    mocks.disconnect.mockRejectedValueOnce(new Error('connection refused'));
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Beta' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha to Outlet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect 2' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('connection refused'));
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.showUndoToast).not.toHaveBeenCalled();
  });

  it('renders loading, error/retry, empty, no-match, offline, and stale states', () => {
    currentStatus = 'pending';
    renderPage();
    expect(screen.getByLabelText('Loading connections')).toBeInTheDocument();

    cleanup();
    currentStatus = 'error';
    renderPage();
    expect(screen.getByText('Connections did not load')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Alpha/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalledOnce();

    cleanup();
    currentStatus = 'success';
    currentRows = [];
    renderPage();
    expect(screen.getByText('Nothing is connected yet')).toBeInTheDocument();

    cleanup();
    renderPage('/inventory/connections?q=missing');
    expect(screen.getByText('No connections match these filters')).toBeInTheDocument();

    cleanup();
    currentRows = rows;
    currentOnline = false;
    renderPage();
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disconnect Alpha from Beta' })).toBeDisabled();

    cleanup();
    currentOnline = true;
    currentStale = true;
    renderPage();
    expect(
      screen.getByText('Connections changed elsewhere since this page loaded')
    ).toBeInTheDocument();
  });
});
