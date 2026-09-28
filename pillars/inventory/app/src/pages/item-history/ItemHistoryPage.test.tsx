import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_HEIGHT } from '../../foundation/frame/page-frame.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { ItemHistoryPage } from './ItemHistoryPage.js';

import type { WebEvent, WebEventsFeed } from '../../inventory-web/useWebEvents.js';

const mocks = vi.hoisted(() => ({
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  revertEvent: vi.fn(),
  undoEvent: vi.fn(),
  usePlacementSources: vi.fn(),
  useOnline: vi.fn(),
  useRevertEvent: vi.fn(),
  useWebEvents: vi.fn(),
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
vi.mock('../../inventory-web/useWebEvents.js', () => ({
  useWebEvents: (...args: unknown[]) => mocks.useWebEvents(...args),
}));
vi.mock('../overview/overview-event-actions.js', () => ({
  undoEvent: (...args: unknown[]) => mocks.undoEvent(...args),
}));

function wireEvent(overrides: Partial<WebEvent> = {}): WebEvent {
  const base: WebEvent = {
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
    entityName: 'Desk lamp',
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

function feed(overrides: Partial<WebEventsFeed> = {}): WebEventsFeed {
  return {
    events: [moved, edited],
    kindCounts: { moved: 1, edited: 1 },
    total: 2,
    status: 'success',
    error: null,
    fetchNextPage: mocks.fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
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
  mocks.useWebEvents.mockImplementation(({ kinds }: { kinds?: readonly string[] }) =>
    kinds === undefined ? feed() : feed({ events: [edited], kindCounts: { edited: 1 }, total: 1 })
  );
});

afterEach(() => {
  cleanup();
});

describe('ItemHistoryPage', () => {
  it('keeps the route frame bounded around the scrolling history list', () => {
    renderPage();

    const heading = screen.getByRole('heading', { name: 'History of Desk lamp' });
    const header = heading.closest('header');
    if (header === null || header.parentElement === null) {
      throw new Error('Item history page frame was not rendered');
    }
    expect(header.parentElement).toHaveClass('min-h-0', 'overflow-hidden', PAGE_HEIGHT);

    const month = screen.getByRole('region', { name: 'September 2026' });
    const list = month.parentElement;
    if (list === null) throw new Error('Item history list was not rendered');
    expect(list).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });

  it('renders filters, month groups, event details, and the undo action', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'History of Desk lamp' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByText('Moved to Study')).toBeInTheDocument();
    expect(screen.getByText('Renamed to Desk lamp v2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Details/ }));

    expect(mocks.useWebEvents).toHaveBeenLastCalledWith({
      entityId: 'item-1',
      kinds: [
        'created',
        'edited',
        'code_set',
        'type_changed',
        'quantity_changed',
        'split_from',
        'split_into',
        'photo_added',
        'photo_removed',
        'override_set',
        'override_cleared',
      ],
      limit: 50,
    });

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
    mocks.useWebEvents.mockReturnValue(feed({ hasNextPage: true, total: 3 }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Load 1 more' }));

    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('uses the loaded count in the header and the filtered count for paging', () => {
    mocks.useWebEvents.mockImplementation(({ kinds }: { kinds?: readonly string[] }) =>
      kinds === undefined
        ? feed({ total: 200, hasNextPage: true })
        : feed({ events: [edited], kindCounts: { edited: 2 }, total: 200, hasNextPage: true })
    );

    renderPage();

    expect(screen.getByText('2 events loaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));

    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load 1 more' })).toBeInTheDocument();
  });

  it('renders the empty state when an item has no history', () => {
    mocks.useWebEvents.mockReturnValue(feed({ events: [], kindCounts: {}, total: 0 }));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Nothing has happened to it yet');
    expect(
      screen.getByText('Moves, edits and lifecycle changes appear here as they happen.')
    ).toBeInTheDocument();
  });

  it('renders a loading state while history is pending', () => {
    mocks.useWebEvents.mockReturnValue(
      feed({ events: [], kindCounts: {}, total: null, status: 'pending' })
    );
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading history' })).toBeInTheDocument();
  });

  it('renders a retry state when history fails', () => {
    mocks.useWebEvents.mockReturnValue(
      feed({ events: [], kindCounts: {}, total: null, status: 'error' })
    );
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
    mocks.useWebEvents.mockReturnValue(feed({ status: 'error' }));
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
