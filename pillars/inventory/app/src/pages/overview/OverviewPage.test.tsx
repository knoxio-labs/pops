import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { OverviewPage } from './OverviewPage.js';

import type { ReactElement } from 'react';

import type { EventModel, ItemRowModel, PlacementTarget } from '../../foundation/model/model.js';
import type {
  WebSummaryGetResponse,
  WebEventsListResponses,
} from '../../inventory-api/types.gen.js';
import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';
import type { ItemRows, WebItemsFilters } from '../../inventory-web/useWebItems.js';

const mocks = vi.hoisted(() => {
  class TestUndoRefusedError extends Error {
    constructor() {
      super('inventory undo was refused');
      this.name = 'UndoRefusedError';
    }
  }

  return {
    TestUndoRefusedError,
    useWebSummary: vi.fn(),
    useItemRows: vi.fn(),
    useWebEvents: vi.fn(),
    useCatalogueLookups: vi.fn(),
    useChangedElsewhere: vi.fn(),
    useOnline: vi.fn(),
    usePlacementSources: vi.fn(),
    useSyncAttention: vi.fn(),
    useItemVerbs: vi.fn(),
    usePendingItemIds: vi.fn(),
    useRevertEvent: vi.fn(),
    revertEvent: vi.fn(),
    toEventModel: vi.fn(),
    showUndoToast: vi.fn(),
    toastCustom: vi.fn(),
    toastError: vi.fn(),
    toastDismiss: vi.fn(),
  };
});

vi.mock('../../inventory-web/useWebSummary.js', () => ({
  WEB_SUMMARY_QUERY_KEY: ['inventory', 'web', 'summary'],
  useWebSummary: mocks.useWebSummary,
}));
vi.mock('../../inventory-web/useWebItems.js', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/useWebEvents.js', () => ({
  WEB_EVENTS_QUERY_KEY: ['inventory', 'web', 'events'],
  useWebEvents: mocks.useWebEvents,
}));
vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useSyncLedger.js', () => ({
  useSyncAttention: mocks.useSyncAttention,
}));
vi.mock('../../inventory-web/item-verbs.js', () => ({
  UndoRefusedError: mocks.TestUndoRefusedError,
  useItemVerbs: mocks.useItemVerbs,
  usePendingItemIds: mocks.usePendingItemIds,
}));
vi.mock('../../inventory-web/useRevertEvent.js', () => ({ useRevertEvent: mocks.useRevertEvent }));
vi.mock('../../inventory-web/event-model.js', () => ({ toEventModel: mocks.toEventModel }));
vi.mock('../../foundation/badges/place-name.js', () => ({
  PlaceName: ({ target }: { target: PlacementTarget }) => <span>{target.kind}</span>,
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
vi.mock('../../foundation/feedback/changed-elsewhere-copy.js', () => ({
  staleTitle: vi.fn(() => 'Changed elsewhere just now.'),
  staleChangeLine: vi.fn((groups: readonly WebChangeGroup[]) => {
    const count = groups.reduce((total, group) => total + group.entityCount, 0);
    return `Phone changed ${count} ${count === 1 ? 'thing' : 'things'}. Reload to see ${count === 1 ? 'it' : 'them'}`;
  }),
}));
vi.mock('../../foundation/feedback/actor-short.js', () => ({
  ACTOR_SHORT: { web: 'Web', device: 'iPhone', service: 'Purchases', migration: 'Catalogue' },
}));
vi.mock('../../foundation/feedback/when.js', () => ({
  formatWhen: vi.fn(() => 'Just now'),
}));
vi.mock('../../foundation/in-hand/in-hand-model.js', () => ({
  returnRoute: (item: ItemRowModel) => {
    if (item.previous === null) return { kind: 'none' };
    if (item.previous.kind === 'deleted') return { kind: 'deleted', name: item.previous.name };
    return { kind: 'back', to: item.previous };
  },
}));
vi.mock('../../foundation/list-page/selection-actions.js', () => ({
  refusalReason: (refusal: { kind: string; outcome?: { message?: string } }) =>
    refusal.kind === 'outcome'
      ? (refusal.outcome?.message ?? 'Rejected')
      : 'The inventory service did not answer.',
}));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  UNDO_RESULT_MS: 3000,
  showUndoToast: mocks.showUndoToast,
  UndoToast: ({ message, state }: { message: string; state: string }) => (
    <div role="status">
      {state}: {message}
    </div>
  ),
}));
vi.mock('../../foundation/placement-picker/placement-picker.js', () => ({
  PlacementPicker: ({ onPick }: { onPick: (target: PlacementTarget) => void }) => (
    <button type="button" onClick={() => onPick({ kind: 'location', locationId: 'garage' })}>
      Pick Garage
    </button>
  ),
}));
vi.mock('sonner', () => ({
  toast: {
    custom: mocks.toastCustom,
    error: mocks.toastError,
    dismiss: mocks.toastDismiss,
  },
}));

const location = { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const };

const summary: WebSummaryGetResponse = {
  containerSegments: { all: 1, closed: 0, full: 0, moving: 0, open: 1, retired: 0 },
  counts: { containers: 1, inHand: 1, items: 2, locations: 1, openContainers: 1, things: 3 },
  moving: { closed: 0, full: 0, open: 0, packed: 0, total: 0 },
  packing: { closed: 0, fullButOpen: 0, open: 0, packedItems: 0 },
};

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
    placement: { kind: 'location', locationId: location.id },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

const openBox = item('box-1', 'Blue box', {
  code: 'B-1',
  container: { access: 'open', full: false },
});
const handItem = item('item-1', 'Lamp', {
  placement: { kind: 'in-hand' },
  previous: { kind: 'location', locationId: location.id },
});
const strandedItem = item('item-2', 'Stranded lamp', { placement: { kind: 'in-hand' } });

function rowsResult(rows: ItemRowModel[], overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows,
    total: rows.length,
    unfilteredTotal: rows.length,
    hiddenInactiveCount: 0,
    baseline: rows.length,
    hidden: 0,
    contentCounts: { 'box-1': { direct: 1, deep: 1 } },
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

type RawEvent = WebEventsListResponses[200]['events'][number];

function rawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    actor: { kind: 'device', label: "Joao's iPhone" },
    after: {},
    before: {},
    clientTime: null,
    compensatesSeq: null,
    entityId: 'item-1',
    entityKind: 'item',
    entityName: 'Lamp',
    fields: ['placement'],
    kind: 'moved',
    reason: null,
    seq: 7,
    serverTime: '2026-09-27T00:00:00.000Z',
    undoable: true,
    ...overrides,
  };
}

function eventModel(source: RawEvent): EventModel {
  return {
    id: String(source.seq),
    itemId: source.entityId,
    itemName: source.entityName,
    kind: 'moved',
    at: source.serverTime,
    actor: 'device',
    actorName: source.actor.label ?? 'Device',
    summary: 'Moved to Garage',
    before: null,
    after: null,
    reason: source.reason,
    undoable: source.undoable && source.compensatesSeq === null,
  };
}

let currentSummary: {
  data: WebSummaryGetResponse | undefined;
  status: 'pending' | 'error' | 'success';
  refetch: ReturnType<typeof vi.fn>;
} = { data: summary, status: 'success', refetch: vi.fn() };
let currentOpen = rowsResult([openBox]);
let currentHand = rowsResult([handItem]);
let currentEvents = [rawEvent()];
let currentOnline = true;
let currentPending = new Set<string>();
let currentAttention = {
  attentionCount: 0,
  devices: [{ id: 'phone', name: "Joao's iPhone", attentionCount: 0 }],
};
let currentChanged = { groups: [] as WebChangeGroup[], stale: false, reload: vi.fn() };

function makeAppliedResult() {
  return { status: 'applied' as const, seq: 8, undo: vi.fn<() => Promise<void>>() };
}

let verbs: {
  setAccess: ReturnType<typeof vi.fn>;
  putBack: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
};

function configureMocks(): void {
  verbs = {
    setAccess: vi.fn(async () => makeAppliedResult()),
    putBack: vi.fn(async () => makeAppliedResult()),
    move: vi.fn(async () => makeAppliedResult()),
  };
  mocks.useWebSummary.mockImplementation(() => currentSummary);
  mocks.useItemRows.mockImplementation((query: WebItemsFilters) =>
    query.placementKind === 'hand' ? currentHand : currentOpen
  );
  mocks.useWebEvents.mockImplementation(() => ({
    events: currentEvents,
    kindCounts: {},
    total: currentEvents.length,
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }));
  mocks.useCatalogueLookups.mockImplementation(() => ({ typeNameById: new Map() }));
  mocks.useOnline.mockImplementation(() => currentOnline);
  mocks.usePendingItemIds.mockImplementation(() => currentPending);
  mocks.useSyncAttention.mockImplementation(() => currentAttention);
  mocks.useChangedElsewhere.mockImplementation(() => currentChanged);
  mocks.useItemVerbs.mockImplementation(() => verbs);
  mocks.useRevertEvent.mockImplementation(() => mocks.revertEvent);
  mocks.usePlacementSources.mockImplementation(() => ({
    world: buildWorld([openBox, handItem, strandedItem], [location]),
    recents: [],
    createLocation: { mutateAsync: vi.fn() },
  }));
  mocks.toEventModel.mockImplementation(eventModel);
  mocks.revertEvent = vi.fn(async () => undefined);
}

function LocationProbe(): ReactElement {
  const current = useLocation();
  return <output data-testid="location">{current.pathname + current.search}</output>;
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/inventory']}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="*" element={<OverviewPage />} />
        </Routes>
        <LocationProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSummary = { data: summary, status: 'success', refetch: vi.fn() };
  currentOpen = rowsResult([openBox]);
  currentHand = rowsResult([handItem]);
  currentEvents = [rawEvent()];
  currentOnline = true;
  currentPending = new Set<string>();
  currentAttention = {
    attentionCount: 0,
    devices: [{ id: 'phone', name: "Joao's iPhone", attentionCount: 0 }],
  };
  currentChanged = { groups: [], stale: false, reload: vi.fn() };
  configureMocks();
});

describe('OverviewPage', () => {
  it('uses the server ordering and display limits for overview reads', () => {
    renderPage();

    expect(mocks.useItemRows).toHaveBeenNthCalledWith(
      1,
      { isContainer: 'true', access: 'open', sort: 'updated' },
      50
    );
    expect(mocks.useItemRows).toHaveBeenNthCalledWith(2, { placementKind: 'hand' }, 5);
  });

  it('shows server totals in panel headers', () => {
    currentOpen = rowsResult(
      [openBox, item('closed-box', 'Closed box', { container: { access: 'closed', full: false } })],
      { total: 4 }
    );
    currentHand = rowsResult([handItem, item('placed-item', 'Placed item')], { total: 6 });
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Open containers' }).parentElement
    ).toHaveTextContent('4');
    expect(screen.getByRole('heading', { name: 'In hand' }).parentElement).toHaveTextContent('6');
  });

  it('shows the count tiles and navigates from a tile', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Items: 2. Open Items' })).toBeInTheDocument();
    expect(screen.getByText('3 counting quantities')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Locations: 1. Open Locations' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/locations');
  });

  it.each([
    [
      'summary',
      () => {
        currentSummary = { data: undefined, status: 'pending', refetch: vi.fn() };
      },
    ],
    [
      'open items',
      () => {
        currentOpen = rowsResult([], { status: 'pending' });
      },
    ],
    [
      'in-hand items',
      () => {
        currentHand = rowsResult([], { status: 'pending' });
      },
    ],
    [
      'events',
      () => {
        currentEvents = [];
        mocks.useWebEvents.mockImplementation(() => ({
          events: [],
          kindCounts: {},
          total: null,
          status: 'pending',
          error: null,
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: vi.fn(),
          refetch: vi.fn(),
        }));
      },
    ],
  ])('shows the loading skeleton while %s is pending', (_source, prepare) => {
    prepare();
    renderPage();
    expect(screen.getByLabelText('Loading overview')).toBeInTheDocument();
  });

  it('closes a container optimistically and offers Undo', async () => {
    const undo = vi.fn(async () => undefined);
    verbs.setAccess.mockResolvedValue({ status: 'applied', seq: 8, undo });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Close Blue box' }));
    await waitFor(() => expect(verbs.setAccess).toHaveBeenCalledWith('box-1', 'closed'));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'closed', message: 'Closed Blue box', onUndo: undo })
    );

    cleanup();
    currentOpen = rowsResult([]);
    renderPage();
    expect(screen.queryByText('Blue box')).not.toBeInTheDocument();
  });

  it('shows no more than five in-hand items and disables Put back without a remembered place', () => {
    currentHand = rowsResult([
      handItem,
      strandedItem,
      item('item-3', 'Third', { placement: { kind: 'in-hand' } }),
      item('item-4', 'Fourth', { placement: { kind: 'in-hand' } }),
      item('item-5', 'Fifth', { placement: { kind: 'in-hand' } }),
      item('item-6', 'Sixth', { placement: { kind: 'in-hand' } }),
    ]);
    renderPage();

    expect(screen.getByText('Fifth')).toBeInTheDocument();
    expect(screen.queryByText('Sixth')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put back Stranded lamp' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('opens Move in one picker and sends the picked destination', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Garage' }));
    await waitFor(() =>
      expect(verbs.move).toHaveBeenCalledWith('item-1', {
        kind: 'location',
        locationId: 'garage',
      })
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'move', message: 'Moved Lamp to Garage' })
    );
  });

  it('keeps a refused Put back reason in the row', async () => {
    verbs.putBack.mockResolvedValue({
      status: 'refused',
      refusal: { kind: 'outcome', outcome: { status: 'rejected', message: 'The box is closed.' } },
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Put back Lamp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved. The box is closed.');
  });

  it('shows the pending Saving badge only while a row is in flight', () => {
    currentPending = new Set(['box-1']);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/inventory']}>
        <ShortcutProvider globalHandlers={{}}>
          <Routes>
            <Route path="*" element={<OverviewPage />} />
          </Routes>
        </ShortcutProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('Saving')).toBeInTheDocument();
    currentPending = new Set();
    rerender(
      <MemoryRouter initialEntries={['/inventory']}>
        <ShortcutProvider globalHandlers={{}}>
          <Routes>
            <Route path="*" element={<OverviewPage />} />
          </Routes>
        </ShortcutProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('Saving')).not.toBeInTheDocument();
  });

  it('shows resolved and conflicted recent-work Undo toasts', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Moved to Garage on Lamp' }));
    await waitFor(() =>
      expect(mocks.revertEvent).toHaveBeenCalledWith({ seq: 7, entityId: 'item-1' })
    );
    expect(mocks.toastCustom).toHaveBeenCalled();

    mocks.revertEvent.mockRejectedValueOnce(new mocks.TestUndoRefusedError());
    fireEvent.click(screen.getByRole('button', { name: 'Undo Moved to Garage on Lamp' }));
    await waitFor(() => expect(mocks.toastCustom).toHaveBeenCalledTimes(2));
  });

  it('shows moving day only once a box is closed', () => {
    renderPage();
    expect(screen.queryByText('Packing up the house')).not.toBeInTheDocument();
    currentSummary = {
      ...currentSummary,
      data: { ...summary, moving: { closed: 1, full: 0, open: 1, packed: 2, total: 2 } },
    };
    renderPage();
    expect(screen.getByText('Packing up the house')).toBeInTheDocument();
  });

  it('shows the first-run card only when all three top-level counts are zero', () => {
    currentSummary = {
      data: {
        ...summary,
        counts: { ...summary.counts, items: 0, containers: 0, locations: 0 },
      },
      status: 'success',
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByRole('heading', { name: 'Nothing is tracked yet' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Open containers' })).not.toBeInTheDocument();
  });

  it('uses only holding devices in the singular attention banner and opens Sync', () => {
    currentAttention = {
      attentionCount: 1,
      devices: [
        { id: 'phone', name: "Joao's iPhone", attentionCount: 1 },
        { id: 'tablet', name: 'iPad', attentionCount: 0 },
      ],
    };
    renderPage();
    expect(screen.getByText("1 change from Joao's iPhone needs a decision.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review in Sync' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/sync');
  });

  it('lets offline take precedence over attention and stale banners', () => {
    currentOnline = false;
    currentAttention = {
      attentionCount: 1,
      devices: [{ id: 'phone', name: "Joao's iPhone", attentionCount: 1 }],
    };
    currentChanged = {
      groups: [
        {
          actorId: 'phone',
          actorKind: 'device',
          actorLabel: "Joao's iPhone",
          entityCount: 1,
          eventCount: 1,
          kindCounts: { moved: 1 },
          latestServerTime: '2026-09-27T00:00:00.000Z',
        },
      ],
      stale: true,
      reload: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/needs a decision/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review in Sync' })).not.toBeInTheDocument();
  });

  it('shows stale Reload copy, including singular thing, while leaving panels visible', () => {
    currentChanged = {
      groups: [
        {
          actorId: 'phone',
          actorKind: 'device',
          actorLabel: "Joao's iPhone",
          entityCount: 1,
          eventCount: 1,
          kindCounts: { moved: 1 },
          latestServerTime: '2026-09-27T00:00:00.000Z',
        },
      ],
      stale: true,
      reload: vi.fn(),
    };
    renderPage();
    expect(screen.getByText(/1 thing/iu)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open containers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(currentChanged.reload).toHaveBeenCalledOnce();
  });

  it('shows the read error and retries every read', () => {
    const summaryRefetch = vi.fn();
    currentSummary = { data: undefined, status: 'error', refetch: summaryRefetch };
    renderPage();
    expect(screen.getByRole('heading', { name: 'The overview did not load' })).toBeInTheDocument();
    expect(
      screen.getByText('The inventory service did not answer. Nothing was changed.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(summaryRefetch).toHaveBeenCalledOnce();
    expect(currentOpen.refetch).toHaveBeenCalledOnce();
    expect(currentHand.refetch).toHaveBeenCalledOnce();
  });
});
