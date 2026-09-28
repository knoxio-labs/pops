import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from '@pops/navigation';

import { buildWorld } from '../../foundation/model/placement-model';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { listTrailState } from '../../inventory-web/list-trail';
import { ItemDetailPage } from './item-detail-page';
import { itemDetailBannerState } from './use-item-detail-state';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from './detail-model';

const mocks = vi.hoisted(() => ({ useItemDetailModel: vi.fn() }));

vi.mock('./use-item-detail-model', () => ({ useItemDetailModel: mocks.useItemDetailModel }));
vi.mock('./detail-store-here', () => ({
  DetailStoreHereSheet: (props: {
    open: boolean;
    target: { name: string };
  }): ReactElement | null =>
    props.open ? <output data-testid="store-here-target">{props.target.name}</output> : null,
}));
vi.mock('./container/workspace', () => ({
  ContainerWorkspace: (props: {
    model: ItemDetailModel;
    storeHereOpen: boolean;
    storeTarget: { name: string };
  }): ReactElement => {
    const [detailsOpen, setDetailsOpen] = useState(false);
    return (
      <>
        <output data-testid="container-workspace">{props.model.item.name}</output>
        <button type="button" onClick={() => setDetailsOpen(true)}>
          Open container details
        </button>
        {detailsOpen ? <output data-testid="container-workspace-details" /> : null}
        {props.storeHereOpen ? (
          <output data-testid="store-here-target">{props.storeTarget.name}</output>
        ) : null}
      </>
    );
  },
}));

const item = {
  id: 'item-1',
  name: 'Desk lamp',
  typeId: 'type-1',
  typeName: 'Lighting',
  code: 'LAMP-1',
  quantity: 1,
  container: null,
  lifecycle: 'active' as const,
  placement: { kind: 'location' as const, locationId: 'study' },
  previous: null,
  sync: 'synced' as const,
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-01T00:00:00Z',
};

const model: ItemDetailModel = {
  item,
  world: buildWorld([item], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]),
  relatedWorld: buildWorld([item], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]),
  aggregate: {
    facts: [],
    type: null,
    fieldValues: [],
    provenance: {
      purchasedOn: null,
      pricePaid: null,
      merchant: null,
      warrantyUntil: null,
      purchase: null,
    },
    photos: [],
  },
  documents: [],
  paperless: 'not-configured',
  paperlessBaseUrl: null,
  connections: [],
  events: [],
  eventCount: 0,
};

function LocationProbe(): ReactElement {
  return <output data-testid="route">{useLocation().pathname}</output>;
}

function NavigationProbe(): ReactElement {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/inventory/items/container-2')}>
      Navigate to container-2
    </button>
  );
}

function renderPage(
  initialEntry: string | { pathname: string; state?: unknown } = '/inventory/items/item-1',
  includeNavigationProbe = false
): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppContextProvider>
          <ShortcutProvider globalHandlers={{}}>
            <Routes>
              <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
            </Routes>
            <LocationProbe />
            {includeNavigationProbe ? <NavigationProbe /> : null}
          </ShortcutProvider>
        </AppContextProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useItemDetailModel.mockReturnValue({
    status: 'ready',
    error: null,
    model,
    banner: null,
    retry: vi.fn(),
  });
});

describe('ItemDetailPage', () => {
  it('renders the header before the detail surface', () => {
    renderPage();
    const header = screen.getByTestId('item-detail-header');
    const detail = screen.getAllByLabelText('Facts rail').at(0);
    if (detail === undefined) throw new Error('Facts rail was not rendered');
    expect(header.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a retry state for a failed lead read', () => {
    const retry = vi.fn();
    mocks.useItemDetailModel.mockReturnValue({
      status: 'error',
      error: new Error('offline'),
      model: null,
      banner: null,
      retry,
    });
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'This item could not be loaded' })
    ).toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders the loading state before the item model exists', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'loading',
      error: null,
      model: null,
      banner: null,
      retry: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading item' })).toBeInTheDocument();
  });

  it('renders a partial banner while keeping the loaded item usable', () => {
    const retry = vi.fn();
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model: { ...model, aggregate: null },
      banner: 'partial',
      retry,
    });

    renderPage();

    expect(screen.getByText('Some item details are still loading.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desk lamp' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders an unavailable banner with the approved offline copy', () => {
    const retry = vi.fn();
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model,
      banner: 'unavailable',
      retry,
    });

    renderPage();

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders an error banner for a failed optional read', () => {
    const retry = vi.fn();
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model,
      banner: 'error',
      retry,
    });

    renderPage();

    expect(screen.getByText('Some item details did not load.')).toBeInTheDocument();
    expect(
      screen.getByText('The inventory service returned an error. Nothing was changed.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('uses the unavailable state for an unavailable lead read', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'error',
      error: new InventoryApiError('inventory unavailable', 503),
      model: null,
      banner: null,
      retry: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'This item is unavailable' })).toBeInTheDocument();
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
  });

  it('renders destroyed items as read-only', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model: { ...model, item: { ...item, lifecycle: 'destroyed' } },
      banner: null,
      retry: vi.fn(),
    });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Desk lamp' })).toHaveClass('text-muted-foreground');
    expect(screen.queryByText('Facts are loading.')).not.toBeInTheDocument();
  });

  it('treats a missing route as not found', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'not-found',
      error: null,
      model: null,
      banner: null,
      retry: vi.fn(),
    });
    renderPage('/inventory/items/missing');
    expect(screen.getByRole('heading', { name: 'This item no longer exists' })).toBeInTheDocument();
    expect(screen.getByText(/Its code may belong to something else now\./)).toBeInTheDocument();
  });

  it('opens the edit form from the header without changing the item action contract', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByTestId('route')).toHaveTextContent('/inventory/items/item-1/edit');
  });

  it('renders the list position and uses the shared detail scope for the next item', () => {
    renderPage({
      pathname: '/inventory/items/item-1',
      state: listTrailState({
        listName: 'Items',
        href: '/inventory/items?q=lead',
        ids: ['item-0', 'item-1', 'item-2'],
      }),
    });

    expect(screen.getByTestId('item-detail-back-row')).toHaveTextContent('Items2 of 3');
    fireEvent.keyDown(window, { key: ']' });

    expect(screen.getByTestId('route')).toHaveTextContent('/inventory/items/item-2');
  });

  it('does not render a back row when the detail page has no list trail', () => {
    renderPage();

    expect(screen.queryByTestId('item-detail-back-row')).not.toBeInTheDocument();
  });

  it('opens Store here with the current container as its target', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model: {
        ...model,
        item: { ...item, container: { access: 'open', full: false } },
      },
      banner: null,
      retry: vi.fn(),
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Store here' }));

    expect(screen.getByTestId('store-here-target')).toHaveTextContent('Desk lamp');
  });

  it('uses the contents-first workspace for container items', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model: {
        ...model,
        item: { ...item, name: 'Archive box', container: { access: 'open', full: false } },
      },
      banner: null,
      retry: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('container-workspace')).toHaveTextContent('Archive box');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('resets container workspace state when navigating to another container', () => {
    const firstContainer = {
      ...model,
      item: {
        ...item,
        id: 'container-1',
        name: 'First box',
        container: { access: 'open', full: false },
      },
    };
    const secondContainer = {
      ...model,
      item: {
        ...item,
        id: 'container-2',
        name: 'Second box',
        container: { access: 'open', full: false },
      },
    };
    mocks.useItemDetailModel.mockImplementation((id: string) => ({
      status: 'ready',
      error: null,
      model: id === 'container-2' ? secondContainer : firstContainer,
      banner: null,
      retry: vi.fn(),
    }));

    renderPage('/inventory/items/container-1', true);

    fireEvent.click(screen.getByRole('button', { name: 'Open container details' }));
    expect(screen.getByTestId('container-workspace-details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to container-2' }));

    expect(screen.getByTestId('container-workspace')).toHaveTextContent('Second box');
    expect(screen.queryByTestId('container-workspace-details')).not.toBeInTheDocument();
  });

  it('keeps the partial boundary at any missing deferred read', () => {
    expect(
      itemDetailBannerState(model, { hasPending: false, hasUnavailable: false, hasError: false })
    ).toBeNull();
    expect(
      itemDetailBannerState(
        { ...model, eventCount: null },
        { hasPending: false, hasUnavailable: false, hasError: false }
      )
    ).toBe('partial');
    expect(
      itemDetailBannerState(model, { hasPending: false, hasUnavailable: true, hasError: false })
    ).toBe('unavailable');
    expect(
      itemDetailBannerState(model, { hasPending: false, hasUnavailable: true, hasError: true })
    ).toBe('error');
    expect(
      itemDetailBannerState(null, { hasPending: true, hasUnavailable: true, hasError: true })
    ).toBeNull();
  });
});
