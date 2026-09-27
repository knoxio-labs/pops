import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlaceContentsData } from '../../inventory-web/usePlaceContents.js';
import type { ContentsVerbState } from './location-page-content-verbs.js';

const mocks = vi.hoisted(() => ({
  useLocationModels: vi.fn(),
  useLocationTallies: vi.fn(),
  useOnline: vi.fn(),
  usePlaceContents: vi.fn(),
  usePlaceEdits: vi.fn(),
  useLocationGoneQuery: vi.fn(),
}));

vi.mock('./location-page-model.js', () => ({ useLocationModels: mocks.useLocationModels }));
vi.mock('../../inventory-web/useLocationTallies.js', () => ({
  useLocationTallies: mocks.useLocationTallies,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/usePlaceContents.js', () => ({
  usePlaceContents: mocks.usePlaceContents,
}));
vi.mock('./location-page-edits.js', () => ({ usePlaceEdits: mocks.usePlaceEdits }));
vi.mock('./location-page-route-query.js', async () => {
  const actual = await vi.importActual<typeof import('./location-page-route-query.js')>(
    './location-page-route-query.js'
  );
  return { ...actual, useLocationGoneQuery: mocks.useLocationGoneQuery };
});

import { PlaceActions } from './location-page-actions.js';
import { LocationBanner, LocationBody } from './location-page-loaded-body.js';
import {
  defaultTab,
  parsePlaceTab,
  placeSummary,
  type PlaceEditsApi,
} from './location-page-parts.js';
import { NoSuchPlace } from './location-page-state.js';
import { filterContents, placeContents } from './location-tab-content-model.js';
import { LocationPage } from './LocationPage.js';
import { PlaceGone } from './place-gone.js';

import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';

const garage: LocationModel = {
  id: 'garage',
  name: 'Garage',
  parentId: null,
  kind: 'property',
};

const emptyEdits: PlaceEditsApi = {
  creatingUnder: null,
  renamingId: null,
  deleting: null,
  lastMove: null,
  error: null,
  startCreate: () => undefined,
  commitCreate: () => undefined,
  cancelCreate: () => undefined,
  startRename: () => undefined,
  commitRename: () => undefined,
  moveTo: () => undefined,
  requestDelete: () => undefined,
  confirmDelete: () => undefined,
  cancelDelete: () => undefined,
  clearMoveNotice: () => undefined,
  clearError: () => undefined,
};

function item(overrides: Partial<ItemRowModel> = {}): ItemRowModel {
  return {
    id: 'item',
    name: 'Cable',
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: garage.id },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

function emptyContents(
  status: PlaceContentsData['status'] = 'pending',
  refetch: () => void = vi.fn()
): PlaceContentsData {
  return { world: buildWorld([], [garage]), status, error: null, refetch };
}

function emptyVerbState(): ContentsVerbState {
  return {
    verbs: {
      pendingIds: new Set<string>(),
      rejections: {},
      pickUp: vi.fn(),
      startMove: vi.fn(),
      takeOut: vi.fn(),
    },
    movingIds: [],
    setMovingIds: vi.fn(),
    moveSelected: vi.fn(),
  };
}

function renderPage(path = '/inventory/locations/garage'): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/inventory/locations/:id" element={<LocationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return queryClient;
}

function mockLoadedLocation(): void {
  mocks.useLocationModels.mockReturnValue({
    locations: [garage],
    status: 'success',
    error: null,
    refetch: vi.fn(),
  });
  mocks.useLocationTallies.mockReturnValue({
    tallyOf: () => ({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 }),
    status: 'success',
    refetch: vi.fn(),
  });
  mocks.useOnline.mockReturnValue(true);
  mocks.usePlaceContents.mockReturnValue(emptyContents());
  mocks.usePlaceEdits.mockReturnValue(emptyEdits);
  mocks.useLocationGoneQuery.mockReturnValue({
    status: 'pending',
    error: null,
    data: undefined,
    refetch: vi.fn(),
  });
}

describe('location page foundations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadedLocation();
  });

  it('maps URL tabs and chooses the first tab with content', () => {
    expect(parsePlaceTab('in-containers')).toBe('in-boxes');
    expect(parsePlaceTab('unknown')).toBeNull();
    expect(defaultTab({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 2, total: 2 })).toBe(
      'places'
    );
    expect(defaultTab({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 })).toBe(
      'items'
    );
    expect(placeSummary({ boxesHere: 2, inBoxes: 5, itemsHere: 1, places: 2, total: 8 })).toBe(
      '2 places inside, 1 thing here, 2 boxes holding 5 things'
    );
  });

  it('keeps primary place actions separate from the toolbar module', async () => {
    const parts = await import('./location-page-parts.js');

    expect(parts).not.toHaveProperty('PlaceActions');
  });

  it('uses five full-width skeleton rows while route data is pending', () => {
    mocks.useLocationModels.mockReturnValue({
      locations: [],
      status: 'pending',
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    const skeleton = screen.getByLabelText('Loading location');
    expect(skeleton.querySelectorAll('.animate-pulse')).toHaveLength(5);
    expect(skeleton.querySelectorAll('.h-9.w-full')).toHaveLength(5);
  });

  it('keeps a missing route loading until the gone read settles', () => {
    mocks.useLocationModels.mockReturnValue({
      locations: [],
      status: 'success',
      error: null,
      refetch: vi.fn(),
    });
    renderPage('/inventory/locations/missing');
    expect(screen.getByLabelText('Loading location')).toBeInTheDocument();
    expect(screen.queryByText('No such place')).not.toBeInTheDocument();
    expect(screen.queryByText('This place was deleted')).not.toBeInTheDocument();
  });

  it('keeps matching box contents and item codes in the local search model', () => {
    const box = item({ id: 'box', name: 'Moving box', container: { access: 'open', full: false } });
    const lamp = item({
      id: 'lamp',
      name: 'Desk lamp',
      code: 'L-17',
      placement: { kind: 'container', containerId: 'box' },
    });
    const contents = placeContents(buildWorld([box, lamp], [garage]), garage.id);

    expect(filterContents(contents, 'L-17').boxes[0]?.contents.map(({ id }) => id)).toEqual([
      'lamp',
    ]);
    expect(filterContents(contents, 'no match').boxes).toHaveLength(0);
  });

  it('renders the contents error with a retry action', () => {
    const retry = vi.fn();
    const contents = emptyContents('error', retry);
    render(
      <LocationBody
        place={garage}
        contents={contents}
        edits={emptyEdits}
        world={contents.world}
        contentVerbs={emptyVerbState()}
        tab="items"
        query=""
        online
        tallyOf={() => ({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 })}
        onStoreHere={vi.fn()}
        onOpenPlace={vi.fn()}
        onOpenItem={vi.fn()}
        onClearQuery={vi.fn()}
        onRetry={retry}
      />
    );
    expect(screen.getByText('Garage did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('prioritises offline copy and reports a stale remote change with reload', () => {
    const reload = vi.fn(async () => undefined);
    const group: WebChangeGroup = {
      actorId: null,
      actorKind: 'device',
      actorLabel: "Joao's iPhone",
      entityCount: 1,
      eventCount: 1,
      kindCounts: { moved: 1 },
      latestServerTime: new Date(Date.now() - 120_000).toISOString(),
    };
    const { rerender } = render(
      <LocationBanner
        place={garage}
        online={false}
        changed={{ groups: [group], stale: true, reload }}
        edits={emptyEdits}
      />
    );
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(
      screen.getByText('Storing, moving and deleting come back when the connection does.')
    ).toBeInTheDocument();

    rerender(
      <LocationBanner
        place={garage}
        online
        changed={{ groups: [group], stale: true, reload }}
        edits={emptyEdits}
      />
    );
    expect(screen.getByText("Garage changed on Joao's iPhone 2 minutes ago.")).toBeInTheDocument();
    expect(screen.getByText('Your selection stays until you reload.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('disables place mutations and hides the menu while offline', () => {
    render(
      <PlaceActions
        place={garage}
        world={buildWorld([], [garage])}
        edits={emptyEdits}
        movingPlace={false}
        setMovingPlace={vi.fn()}
        showPlaces={vi.fn()}
        onStoreHere={vi.fn()}
        offline
      />
    );
    expect(screen.getByRole('button', { name: 'New place inside' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Store here' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Actions for Garage' })).not.toBeInTheDocument();
  });

  it('retries the location tree and tallies after a route-level error', () => {
    const refetchTallies = vi.fn();
    mocks.useLocationModels.mockReturnValue({
      locations: [],
      status: 'error',
      error: new Error(),
      refetch: vi.fn(),
    });
    mocks.useLocationTallies.mockReturnValue({
      tallyOf: () => ({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 }),
      status: 'success',
      refetch: refetchTallies,
    });
    const queryClient = renderPage();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    expect(screen.getByText('Places did not load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LOCATIONS_TREE_QUERY_KEY });
    expect(refetchTallies).toHaveBeenCalledOnce();
  });

  it('distinguishes a deleted place from an unknown place', () => {
    mocks.useLocationModels.mockReturnValue({
      locations: [],
      status: 'success',
      error: null,
      refetch: vi.fn(),
    });
    mocks.useLocationGoneQuery.mockReturnValue({
      status: 'success',
      error: null,
      data: {
        id: 'old',
        name: 'Garage',
        deletedAt: '2026-09-27T00:00:00.000Z',
        deletedBy: { kind: 'web', label: "Joao's iPhone" },
        inHandCount: 2,
      },
      refetch: vi.fn(),
    });
    renderPage('/inventory/locations/old');
    expect(screen.getByText("Garage was deleted on Joao's iPhone")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open In hand' })).toBeInTheDocument();

    cleanup();
    const back = vi.fn();
    const openInHand = vi.fn();
    render(
      <MemoryRouter>
        <PlaceGone name="Garage" inHand={0} onBack={back} onOpenInHand={openInHand} />
      </MemoryRouter>
    );
    expect(screen.getByText('Garage was deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open In hand' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Locations' }));
    expect(back).toHaveBeenCalledOnce();
    render(<NoSuchPlace onBack={back} />);
    expect(screen.getByText('No such place')).toBeInTheDocument();
  });

  it('treats a gone endpoint 404 as a deliberate missing-link state', () => {
    mocks.useLocationModels.mockReturnValue({
      locations: [],
      status: 'success',
      error: null,
      refetch: vi.fn(),
    });
    mocks.useLocationGoneQuery.mockReturnValue({
      status: 'error',
      error: new InventoryApiError('missing', 404),
      data: undefined,
      refetch: vi.fn(),
    });
    renderPage('/inventory/locations/missing');
    expect(screen.getByText('No place in Inventory has this link.')).toBeInTheDocument();
  });
});
