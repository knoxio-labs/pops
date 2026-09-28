import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ItemHistoryPage } from './ItemHistoryPage.js';

import type { WebGetResponses } from '../../inventory-api/types.gen.js';

type HistoryPage = WebGetResponses[200];
type HistoryWireEvent = HistoryPage['history']['events'][number];

const mocks = vi.hoisted(() => ({
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  revertEvent: vi.fn(),
  undoEvent: vi.fn(),
  usePlacementSources: vi.fn(),
  useOnline: vi.fn(),
  useRevertEvent: vi.fn(),
  useWebItemHistory: vi.fn(),
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: (...args: unknown[]) => mocks.usePlacementSources(...args),
}));
vi.mock('../../inventory-web/useOnline.js', () => ({
  useOnline: () => mocks.useOnline(),
}));
vi.mock('../../inventory-web/useRevertEvent.js', () => ({
  useRevertEvent: () => mocks.useRevertEvent(),
}));
vi.mock('../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemHistory: (...args: unknown[]) => mocks.useWebItemHistory(...args),
}));
vi.mock('../overview/overview-event-actions.js', () => ({
  undoEvent: (...args: unknown[]) => mocks.undoEvent(...args),
}));

const item: HistoryPage['item'] = {
  access: null,
  catalogueRevision: null,
  code: null,
  computedValues: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Desk lamp',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'study' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 2,
  seq: 2,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-03T00:00:00.000Z',
};

function wireEvent(overrides: Partial<HistoryWireEvent> = {}): HistoryWireEvent {
  const base: HistoryWireEvent = {
    actor: { kind: 'web', label: 'João' },
    after: {
      lifecycle: 'active',
      name: 'Desk lamp',
      placement: { kind: 'location', locationId: 'study' },
    },
    before: {
      lifecycle: 'active',
      name: 'Desk lamp',
      placement: { kind: 'hand' },
    },
    clientTime: null,
    compensatesSeq: null,
    entityId: 'item-1',
    entityKind: 'item',
    fields: ['placement'],
    kind: 'moved',
    reason: 'Put it away',
    seq: 1,
    serverTime: '2026-09-01T00:00:00.000Z',
    undoable: true,
  };
  return { ...base, ...overrides };
}

const moved = wireEvent();
const edited = wireEvent({
  after: {
    lifecycle: 'active',
    name: 'Desk lamp v2',
    placement: { kind: 'location', locationId: 'study' },
  },
  before: {
    lifecycle: 'active',
    name: 'Desk lamp',
    placement: { kind: 'location', locationId: 'study' },
  },
  fields: ['name'],
  kind: 'edited',
  reason: null,
  seq: 2,
  serverTime: '2026-08-20T00:00:00.000Z',
  undoable: false,
});

function page(events: HistoryWireEvent[] = [moved, edited]): HistoryPage {
  return { item, history: { events, nextCursor: null } };
}

interface HistoryQueryState {
  data?: { pages: HistoryPage[]; pageParams: Array<string | undefined> };
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  refetch: () => void;
}

function query(overrides: Partial<HistoryQueryState> = {}): HistoryQueryState {
  return {
    data: { pages: [page()], pageParams: [undefined] },
    fetchNextPage: mocks.fetchNextPage,
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: mocks.refetch,
    ...overrides,
  };
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/inventory/items/item-1/history']}>
      <Routes>
        <Route path="/inventory/items/:id/history" element={<ItemHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchNextPage.mockClear();
  mocks.refetch.mockClear();
  mocks.revertEvent.mockResolvedValue(undefined);
  mocks.undoEvent.mockResolvedValue(undefined);
  mocks.usePlacementSources.mockReturnValue({
    catalogue: undefined,
    isError: false,
    isLoading: false,
    world: buildWorld([], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]),
  });
  mocks.useOnline.mockReturnValue(true);
  mocks.useRevertEvent.mockReturnValue(mocks.revertEvent);
  mocks.useWebItemHistory.mockReturnValue(query());
});

afterEach(() => {
  cleanup();
});

describe('ItemHistoryPage', () => {
  it('renders filters, month groups, event details, and the undo action', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'History of Desk lamp' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByText('Moved to Study')).toBeInTheDocument();
    expect(screen.getByText('Renamed to Desk lamp v2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Details/ }));

    expect(screen.queryByText('Moved to Study')).not.toBeInTheDocument();
    expect(screen.getByText('Renamed to Desk lamp v2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    fireEvent.click(screen.getByRole('button', { name: /Moved to Study/ }));

    const detail = screen.getByRole('region', { name: 'Moved to Study' });
    expect(within(detail).getByText('In hand')).toBeInTheDocument();
    expect(within(detail).getByText('Study')).toBeInTheDocument();
    expect(within(detail).getByText('João')).toBeInTheDocument();
    expect(within(detail).getByText('Put it away')).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Moved to Study' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mocks.undoEvent).toHaveBeenCalledOnce());
    const call = mocks.undoEvent.mock.calls[0];
    expect(call?.[0]).toMatchObject({
      model: { id: '1', summary: 'Moved to Study' },
      source: { entityId: 'item-1', entityName: 'Desk lamp', seq: 1 },
    });
    expect(call?.[1]).toBe(mocks.revertEvent);
  });

  it('loads another cursor page from the history list', () => {
    mocks.useWebItemHistory.mockReturnValue(query({ hasNextPage: true }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Load more events' }));

    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('renders the empty state when an item has no history', () => {
    mocks.useWebItemHistory.mockReturnValue(
      query({ data: { pages: [page([])], pageParams: [undefined] } })
    );
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Nothing has happened to it yet');
    expect(
      screen.getByText('Moves, edits and lifecycle changes appear here as they happen.')
    ).toBeInTheDocument();
  });

  it('renders a loading state while history is pending', () => {
    mocks.useWebItemHistory.mockReturnValue(query({ data: undefined, isPending: true }));
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading history' })).toBeInTheDocument();
  });

  it('renders a retry state when history fails', () => {
    mocks.useWebItemHistory.mockReturnValue(query({ data: undefined, isError: true }));
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'This history could not be loaded' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it('keeps cached history visible and disables Undo while offline', () => {
    mocks.useOnline.mockReturnValue(false);
    renderPage();

    expect(screen.getByText('Moved to Study')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No connection. Showing what loaded.');

    const rowUndo = screen.getByRole('button', { name: 'Undo' });
    expect(rowUndo).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(rowUndo);
    expect(mocks.undoEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Moved to Study/ }));
    const detail = screen.getByRole('region', { name: 'Moved to Study' });
    const detailUndo = within(detail).getByRole('button', { name: 'Undo this change' });
    expect(detailUndo).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(detailUndo);
    expect(mocks.undoEvent).not.toHaveBeenCalled();
  });

  it('keeps cached history visible and disables Undo when a refetch fails', () => {
    mocks.useWebItemHistory.mockReturnValue(query({ isError: true }));
    renderPage();

    expect(screen.getByText('Moved to Study')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('History could not be refreshed.');

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(undo);
    expect(mocks.undoEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
