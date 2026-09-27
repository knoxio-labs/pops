import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { LocationTreePage } from './locations-page.js';

import type { ReactElement } from 'react';

import type { ItemRowModel, LocationModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';

const mocks = vi.hoisted(() => ({
  online: true,
  locations: {
    locations: [] as LocationModel[],
    status: 'success' as 'pending' | 'error' | 'success',
    error: null as Error | null,
    refetch: vi.fn(),
  },
  tallies: {
    tallyOf: vi.fn((_id: string) => zeroTally()),
    status: 'success' as 'pending' | 'error' | 'success',
    refetch: vi.fn(),
  },
  contents: {
    world: emptyWorld(),
    status: 'success' as 'pending' | 'error' | 'success',
    error: null as Error | null,
    refetch: vi.fn(),
  },
  changed: {
    groups: [] as Array<{ actorLabel: string; latestServerTime: string }>,
    stale: false,
    reload: vi.fn(async () => undefined),
  },
  baseEdits: {
    creatingUnder: null as string | null,
    renamingId: null as string | null,
    deleting: null as {
      id: string;
      name: string;
      parentId: string | null;
      childCount: number;
      descendantCount: number;
      itemCount: number;
      requiresForce: boolean;
    } | null,
    lastMove: null,
    error: null as string | null,
    startCreate: vi.fn(),
    commitCreate: vi.fn(),
    cancelCreate: vi.fn(),
    startRename: vi.fn(),
    commitRename: vi.fn(),
    moveTo: vi.fn(),
    requestDelete: vi.fn(),
    confirmDelete: vi.fn(),
    cancelDelete: vi.fn(),
    clearMoveNotice: vi.fn(),
    clearError: vi.fn(),
  },
  contentsVerbs: {
    pickUp: vi.fn(),
    startMove: vi.fn(),
    takeOut: vi.fn(),
    moveSelected: vi.fn(),
  },
}));

vi.mock('../location-page/location-page-model.js', () => ({
  useLocationModels: () => mocks.locations,
}));
vi.mock('../../inventory-web/useLocationTallies.js', () => ({
  LOCATION_TALLIES_QUERY_KEY: ['inventory', 'web', 'location-tallies'],
  useLocationTallies: () => mocks.tallies,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: () => mocks.online }));
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: () => mocks.changed,
}));
vi.mock('../location-page/location-page-edits.js', () => ({
  usePlaceEdits: () => mocks.baseEdits,
}));
vi.mock('../../inventory-web/usePlaceContents.js', () => ({
  usePlaceContents: () => mocks.contents,
}));
vi.mock('../location-page/location-page-content-verbs.js', () => ({
  useContentsVerbs: (
    _world: unknown,
    online: boolean,
    movingIds: readonly string[],
    setMovingIds: (ids: readonly string[]) => void
  ) => ({
    verbs: {
      pendingIds: new Set<string>(),
      rejections: {},
      disabledReason: online ? undefined : 'No connection. Changes are off until it is back.',
      pickUp: mocks.contentsVerbs.pickUp,
      startMove: (ids: readonly string[]) => {
        mocks.contentsVerbs.startMove(ids);
        setMovingIds(ids);
      },
      takeOut: mocks.contentsVerbs.takeOut,
    },
    movingIds,
    setMovingIds,
    moveSelected: mocks.contentsVerbs.moveSelected,
  }),
}));
vi.mock('../../foundation/shortcuts/shortcut-provider.js', () => ({
  useShortcutScope: () => undefined,
}));
vi.mock('../../foundation/placement-picker/placement-picker.js', () => ({
  PlacementPicker: ({
    trigger,
    open,
    onOpenChange,
    onPick,
  }: {
    trigger: ReactElement;
    open?: boolean;
    onOpenChange?: (value: boolean) => void;
    onPick: (target: PlacementTarget) => void;
  }) => (
    <>
      <span onClick={() => onOpenChange?.(true)}>{trigger}</span>
      {open ? (
        <div role="dialog" aria-label="Choose a place">
          <button
            type="button"
            onClick={() => {
              onPick({ kind: 'location', locationId: 'garage' });
              onOpenChange?.(false);
            }}
          >
            Choose Garage
          </button>
        </div>
      ) : null}
    </>
  ),
}));

function zeroTally(): PlaceTally {
  return { boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 };
}

function emptyWorld(): PlacementWorld {
  return { items: new Map(), locations: new Map() };
}

function place(id: string, name: string, parentId: string | null = null): LocationModel {
  return { id, name, parentId, kind: parentId === null ? 'property' : 'room' };
}

function item(id: string, name: string, locationId: string): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function StateProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="route-state">{JSON.stringify(location.state)}</output>;
}

function resetFixtures(): void {
  const locations = [
    place('home', 'Home'),
    place('living', 'Living room', 'home'),
    place('shelf', 'Shelf', 'living'),
    place('garage', 'Garage'),
  ];
  mocks.online = true;
  mocks.locations = { ...mocks.locations, locations, status: 'success', error: null };
  const tallies = new Map<string, PlaceTally>([
    ['home', { ...zeroTally(), total: 3, places: 2 }],
    ['living', { ...zeroTally(), total: 1, itemsHere: 1 }],
    ['shelf', zeroTally()],
    ['garage', zeroTally()],
  ]);
  mocks.tallies = {
    ...mocks.tallies,
    tallyOf: vi.fn((id: string) => tallies.get(id) ?? zeroTally()),
    status: 'success',
  };
  mocks.contents = {
    ...mocks.contents,
    world: buildWorld([item('lamp', 'Lamp', 'living')], locations),
    status: 'success',
    error: null,
  };
  mocks.changed = { groups: [], stale: false, reload: vi.fn(async () => undefined) };
  mocks.baseEdits = {
    ...mocks.baseEdits,
    creatingUnder: null,
    renamingId: null,
    deleting: null,
    error: null,
  };
  mocks.contentsVerbs.pickUp.mockClear();
  mocks.contentsVerbs.startMove.mockClear();
  mocks.contentsVerbs.takeOut.mockClear();
  mocks.contentsVerbs.moveSelected.mockClear();
  mocks.baseEdits.startCreate.mockClear();
  mocks.baseEdits.startRename.mockClear();
  mocks.baseEdits.moveTo.mockClear();
}

function renderPage(initialEntry = '/inventory/locations') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/inventory/locations"
            element={
              <>
                <LocationTreePage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/inventory/locations/:id" element={<div data-testid="place-detail" />} />
          <Route
            path="/inventory/items/:id"
            element={
              <>
                <div data-testid="item-detail" />
                <StateProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

describe('LocationTreePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFixtures();
  });

  it('describes the place count without the legacy instruction', () => {
    renderPage();

    expect(screen.getByText('4 places.')).toBeInTheDocument();
    expect(screen.queryByText(/drag/i)).not.toBeInTheDocument();
  });

  it('selects from the URL, reveals ancestors, preserves other params, and shows tally summary', async () => {
    renderPage('/inventory/locations?tab=review&selected=shelf');

    expect((await screen.findAllByText('Living room')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shelf').length).toBeGreaterThan(0);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tab=review'));
    expect(screen.getByTestId('location')).toHaveTextContent('selected=garage');
  });

  it('opens, renames, and moves the selected place from tree keys', async () => {
    renderPage('/inventory/locations?selected=home');
    const tree = screen.getByRole('tree');

    fireEvent.keyDown(tree, { key: 'e' });
    expect(mocks.baseEdits.startRename).toHaveBeenCalledWith('home');
    fireEvent.keyDown(tree, { key: 'm' });
    expect(await screen.findByRole('dialog', { name: 'Choose a place' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Garage' }));
    expect(mocks.baseEdits.moveTo).toHaveBeenCalledWith('home', 'garage');

    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(await screen.findByTestId('place-detail')).toBeInTheDocument();
  });

  it('shows the filtered empty copy and an inline create row', () => {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter places by name' }), {
      target: { value: 'attic' },
    });
    expect(
      screen.getByText('No place is called “attic”. Clear the filter to see every place.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New place' }));
    expect(screen.getByRole('textbox', { name: 'Name of the new place' })).toBeInTheDocument();
  });

  it('renders the page-level delete confirmation state', () => {
    mocks.baseEdits.deleting = {
      id: 'home',
      name: 'Home',
      parentId: null,
      childCount: 1,
      descendantCount: 2,
      itemCount: 0,
      requiresForce: false,
    };
    renderPage();

    expect(screen.getByRole('dialog')).toHaveTextContent('Delete “Home”?');
    expect(screen.getByRole('button', { name: 'Delete place' })).toBeInTheDocument();
  });

  it('renders preview skeletons while contents load and a retryable error when they do not', () => {
    mocks.contents.status = 'pending';
    const view = renderPage('/inventory/locations?selected=living');
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);

    mocks.contents = { ...mocks.contents, status: 'error', error: new Error('offline') };
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <MemoryRouter initialEntries={['/inventory/locations?selected=living']}>
          <Routes>
            <Route path="/inventory/locations" element={<LocationTreePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Living room did not load')).toBeInTheDocument();
    expect(
      screen.getByText('The inventory service did not answer. Nothing was changed.')
    ).toBeInTheDocument();
  });

  it('selects content and carries the place list trail when opening an item', async () => {
    renderPage('/inventory/locations?selected=living');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lamp' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Lamp' }));

    expect(await screen.findByTestId('item-detail')).toBeInTheDocument();
    expect(screen.getByTestId('route-state')).toHaveTextContent('listName');
    expect(screen.getByTestId('route-state')).toHaveTextContent(
      '/inventory/locations?selected=living'
    );
  });

  it('keeps only Open available while offline and disables place creation', () => {
    mocks.online = false;
    renderPage('/inventory/locations?selected=home');
    expect(screen.getByRole('button', { name: 'New place in Home' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Actions for Home' })[0], {
      key: 'Enter',
    });
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'e' });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'm' });
    expect(mocks.baseEdits.startRename).not.toHaveBeenCalled();
    expect(mocks.baseEdits.moveTo).not.toHaveBeenCalled();
  });

  it('renders loading and error states for either page query and retries both', () => {
    mocks.locations.status = 'pending';
    renderPage();
    expect(screen.getByLabelText('Loading places')).toBeInTheDocument();

    mocks.locations = { ...mocks.locations, status: 'error', error: new Error('failed') };
    const view = renderPage();
    expect(screen.getByText('Places did not load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.locations.refetch).toHaveBeenCalled();
    expect(mocks.tallies.refetch).toHaveBeenCalled();
    view.unmount();
  });

  it('keeps loaded tree data visible behind a stale banner until Reload', () => {
    mocks.changed = {
      groups: [{ actorLabel: 'another device', latestServerTime: new Date().toISOString() }],
      stale: true,
      reload: vi.fn(async () => undefined),
    };
    renderPage('/inventory/locations?selected=home');

    expect(screen.getByText('Places changed on another device 0 minutes ago.')).toBeInTheDocument();
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(mocks.changed.reload).toHaveBeenCalled();
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  });
});
