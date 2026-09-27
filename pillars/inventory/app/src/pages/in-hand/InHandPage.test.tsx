import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { InHandPage } from './InHandPage.js';

import type { ReactElement, ReactNode } from 'react';

import type { PlacementTarget, ItemRowModel } from '../../foundation/model/model.js';
import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';
import type { ItemRows } from '../../inventory-web/useWebItems.js';

const mocks = vi.hoisted(() => ({
  useItemRows: vi.fn(),
  usePendingItemIds: vi.fn(),
  useItemVerbs: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  useChangedElsewhere: vi.fn(),
  useOnline: vi.fn(),
  usePlacementSources: vi.fn(),
  showUndoToast: vi.fn(),
  listTrailState: vi.fn(),
}));

vi.mock('../../inventory-web/useWebItems.js', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/item-verbs.js', () => ({
  useItemVerbs: mocks.useItemVerbs,
  usePendingItemIds: mocks.usePendingItemIds,
}));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/list-trail.js', () => ({
  listTrailState: mocks.listTrailState,
}));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));
vi.mock('../../foundation/feedback/changed-elsewhere-copy.js', () => ({
  changedBy: (groups: readonly WebChangeGroup[]) =>
    groups.length === 1 ? (groups[0]?.actorLabel ?? '0 sources') : `${groups.length} sources`,
  changedCount: (groups: readonly WebChangeGroup[]) =>
    groups.reduce((total, group) => total + group.entityCount, 0),
  staleTitle: () => 'Changed elsewhere just now.',
}));
vi.mock('../../foundation/feedback/state-banner.js', () => ({
  OFFLINE_REASON: 'No connection. Changes are off until it is back.',
  OFFLINE_TITLE: 'No connection. Showing what loaded.',
  StateBanner: ({
    title,
    detail,
    actionLabel,
    onAction,
  }: {
    title: string;
    detail?: ReactNode;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <div role="status">
      <p>{title}</p>
      <p>{detail}</p>
      {actionLabel ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  ),
}));
vi.mock('../../foundation/frame/load-error.js', () => ({
  LoadError: ({
    title,
    detail,
    onRetry,
  }: {
    title: string;
    detail: string;
    onRetry: () => void;
  }) => (
    <div role="alert">
      <h2>{title}</h2>
      <p>{detail}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));
vi.mock('../../foundation/badges/place-name.js', () => ({
  PlaceName: ({ target }: { target: PlacementTarget }) => (
    <span>{target.kind === 'location' ? 'Garage' : 'Container'}</span>
  ),
}));
vi.mock('../../foundation/in-hand/in-hand-model.js', () => ({
  returnRoute: (item: ItemRowModel) => {
    if (item.previous === null) return { kind: 'none' };
    if (item.previous.kind === 'deleted') return { kind: 'deleted', name: item.previous.name };
    return { kind: 'back', to: item.previous };
  },
  orderInHand: (items: readonly ItemRowModel[]) => [
    ...items.filter((item) => item.previous === null || item.previous.kind === 'deleted'),
    ...items.filter((item) => item.previous !== null && item.previous.kind !== 'deleted'),
  ],
  planPutBackAll: (items: readonly ItemRowModel[]) => {
    const returnable = items.filter(
      (item) => item.previous !== null && item.previous.kind !== 'deleted'
    );
    const stranded = items.filter(
      (item) => item.previous === null || item.previous.kind === 'deleted'
    );
    return {
      returnable,
      stranded,
      label:
        stranded.length === 0 ? 'Put back all' : `Put back ${returnable.length} of ${items.length}`,
      disabledReason: returnable.length === 0 ? 'Nothing can go back where it came from' : null,
    };
  },
}));
vi.mock('../../foundation/list-page/selection-actions.js', () => ({
  refusalReason: (refusal: { kind: string; outcome?: { status: string; message?: string } }) =>
    refusal.outcome?.message ?? 'It has no place to go back to.',
}));
vi.mock('../../foundation/placement-picker/placement-picker.js', () => ({
  PlacementPicker: ({ onPick }: { onPick: (target: PlacementTarget) => void }) => (
    <button type="button" onClick={() => onPick({ kind: 'location', locationId: 'garage' })}>
      Pick Garage
    </button>
  ),
}));

const garage = { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const };

function item(id: string, name: string, overrides: Partial<ItemRowModel> = {}): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

const lamp = item('lamp', 'Lamp', {
  previous: { kind: 'location', locationId: garage.id },
});
const loose = item('loose', 'Loose cable');
const deleted = item('deleted', 'Deleted place item', {
  previous: { kind: 'deleted', name: 'Old shed' },
});

function rowsResult(rows: readonly ItemRowModel[], overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows: [...rows],
    total: rows.length,
    unfilteredTotal: rows.length,
    hiddenInactiveCount: 0,
    baseline: rows.length,
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

function LocationProbe(): ReactElement {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

let currentRows = rowsResult([lamp]);
let currentOnline = true;
let currentPending = new Set<string>();
let currentChanged: {
  groups: WebChangeGroup[];
  stale: boolean;
  reload: () => Promise<void>;
} = { groups: [], stale: false, reload: vi.fn(async () => undefined) };
let currentVerbs: { putBack: ReturnType<typeof vi.fn>; move: ReturnType<typeof vi.fn> };
let currentBulk: { putBack: ReturnType<typeof vi.fn>; move: ReturnType<typeof vi.fn> };

function renderPage(initialEntry = '/inventory/in-hand'): void {
  mocks.useItemRows.mockReturnValue(currentRows);
  mocks.useOnline.mockReturnValue(currentOnline);
  mocks.usePendingItemIds.mockReturnValue(currentPending);
  mocks.useChangedElsewhere.mockReturnValue(currentChanged);
  mocks.useItemVerbs.mockReturnValue(currentVerbs);
  mocks.useBulkItemVerbs.mockReturnValue(currentBulk);
  mocks.usePlacementSources.mockReturnValue({
    world: buildWorld(currentRows.rows, [garage]),
    recents: [],
    createLocation: { mutateAsync: vi.fn(async () => undefined) },
  });

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<InHandPage />} />
        </Routes>
        <LocationProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentRows = rowsResult([lamp]);
  currentOnline = true;
  currentPending = new Set<string>();
  currentChanged = { groups: [], stale: false, reload: vi.fn(async () => undefined) };
  currentVerbs = {
    putBack: vi.fn().mockResolvedValue({ status: 'applied', seq: 1, undo: null }),
    move: vi.fn().mockResolvedValue({ status: 'applied', seq: 2, undo: null }),
  };
  currentBulk = {
    putBack: vi.fn().mockResolvedValue({ applied: [], refused: [], undo: null }),
    move: vi.fn().mockResolvedValue({ applied: [], refused: [], undo: null }),
  };
  mocks.listTrailState.mockImplementation(
    (trail: { listName: string; href: string; ids: readonly string[] }) => ({
      listTrail: trail,
    })
  );
});

afterEach(cleanup);

describe('InHandPage', () => {
  it('requests the hand list, orders stranded rows first, and explains their origin', () => {
    currentRows = rowsResult([lamp, loose, deleted]);
    renderPage();

    expect(mocks.useItemRows).toHaveBeenCalledWith({ placementKind: 'hand' }, MAX_LABEL_IDS);
    expect(screen.getByText(/3 in hand\./u)).toBeInTheDocument();
    expect(screen.getByText(/1 can go back where they came from/u)).toBeInTheDocument();
    expect(screen.getByText(/2 need a place chosen\./u)).toBeInTheDocument();
    expect(screen.getAllByRole('row')[0]).toHaveTextContent('Loose cable');
    expect(screen.getByText('Old shed was deleted. Choose a new place')).toBeInTheDocument();
    expect(screen.getByText('Found loose, never placed. Choose a place')).toBeInTheDocument();
    expect(
      within(screen.getAllByRole('row')[0]).getByRole('button', { name: 'Put back' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('fetches every page before replacing the loading state with rows', async () => {
    const fetchNextPage = vi.fn();
    currentRows = rowsResult([lamp], { hasNextPage: true, fetchNextPage });
    renderPage();

    expect(screen.getByLabelText('Loading in hand')).toBeInTheDocument();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledOnce());
  });

  it('renders the empty state and retries a failed read', () => {
    currentRows = rowsResult([]);
    renderPage();
    expect(screen.getByText('Nothing in hand')).toBeInTheDocument();

    cleanup();
    const refetch = vi.fn();
    currentRows = rowsResult([], { status: 'error', refetch });
    renderPage();
    expect(screen.getByRole('heading', { name: 'In hand did not load' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('puts back only returnable items from the header plan and offers undo', async () => {
    const undo = vi.fn(async () => undefined);
    currentBulk.putBack.mockResolvedValue({ applied: ['lamp'], refused: [], undo });
    currentRows = rowsResult([lamp, loose]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Put back 1 of 2' }));
    await waitFor(() => expect(currentBulk.putBack).toHaveBeenCalledWith(['lamp']));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: 'putBack',
        message: 'Put Lamp back in Garage',
        onUndo: undo,
      })
    );
  });

  it('keeps a refused row reason visible and handles a stranded row as disabled', async () => {
    currentVerbs.putBack.mockResolvedValue({
      status: 'refused',
      refusal: {
        kind: 'outcome',
        outcome: { status: 'rejected', message: 'The place is closed.' },
      },
    });
    currentRows = rowsResult([lamp, loose]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Put back in Garage' }));
    expect(currentVerbs.putBack).toHaveBeenCalledWith('lamp');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved. The place is closed.');
    expect(screen.getByRole('button', { name: 'Put back' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('moves one focused row through the placement picker', async () => {
    const undo = vi.fn(async () => undefined);
    currentVerbs.move.mockResolvedValue({ status: 'applied', seq: 2, undo });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move Lamp' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pick Garage' }));
    await waitFor(() =>
      expect(currentVerbs.move).toHaveBeenCalledWith('lamp', {
        kind: 'location',
        locationId: 'garage',
      })
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'move', message: 'Moved Lamp to Garage', onUndo: undo })
    );
  });

  it('uses one bulk move for a multi-row selection', async () => {
    const drill = item('drill', 'Drill', {
      previous: { kind: 'location', locationId: garage.id },
    });
    const undo = vi.fn(async () => undefined);
    currentRows = rowsResult([lamp, drill]);
    currentBulk.move.mockResolvedValue({ applied: ['lamp', 'drill'], refused: [], undo });
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lamp' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Drill' }));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', {
        name: /^Move/u,
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Pick Garage' }));

    await waitFor(() =>
      expect(currentBulk.move).toHaveBeenCalledWith(['lamp', 'drill'], {
        kind: 'location',
        locationId: 'garage',
      })
    );
    expect(currentVerbs.move).not.toHaveBeenCalled();
  });

  it('disables label printing at the maximum-plus-one boundary', { timeout: 15_000 }, () => {
    const many = Array.from({ length: MAX_LABEL_IDS + 1 }, (_, index) =>
      item(`item-${index}`, `Item ${index}`)
    );
    currentRows = rowsResult(many);
    renderPage();

    fireEvent.keyDown(screen.getByRole('grid', { name: 'In hand' }), {
      key: 'a',
      ctrlKey: true,
    });
    expect(
      within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', {
        name: /^Label/u,
      })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('gives offline precedence and keeps every page verb disabled', () => {
    currentOnline = false;
    renderPage();

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put back all' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Put back in Garage' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Put back in Garage' }));
    expect(currentVerbs.putBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lamp' }));
    expect(
      within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', {
        name: /^Move/u,
      })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows stale data without replacing rows until Reload', () => {
    const reload = vi.fn(async () => undefined);
    currentChanged = {
      groups: [
        {
          actorId: 'phone',
          actorKind: 'device',
          actorLabel: 'Phone',
          entityCount: 2,
          eventCount: 2,
          kindCounts: { moved: 2 },
          latestServerTime: '2026-09-27T00:00:00.000Z',
        },
      ],
      stale: true,
      reload,
    };
    renderPage();

    expect(screen.getByText('Changed elsewhere just now.')).toBeInTheDocument();
    expect(screen.getByText(/Phone changed 2 things/u)).toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('opens the focused row with the in-hand list trail and clears selection on Escape', () => {
    renderPage();
    const grid = screen.getByRole('grid', { name: 'In hand' });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'j' });
    fireEvent.keyDown(grid, { key: 'Enter' });

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/lamp');
    expect(screen.getByTestId('location')).toHaveAttribute(
      'data-state',
      JSON.stringify({
        listTrail: { listName: 'In hand', href: '/inventory/in-hand', ids: ['lamp'] },
      })
    );

    cleanup();
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lamp' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('checkbox', { name: 'Select Lamp' })).not.toBeChecked();
  });
});
