import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from '@pops/navigation';

import { buildWorld } from '../../foundation/model/placement-model';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider';
import { ItemDetailPage } from './item-detail-page';

import type { ItemDetailModel } from './detail-model';

const mocks = vi.hoisted(() => ({ useItemDetailModel: vi.fn() }));

vi.mock('./use-item-detail-model', () => ({ useItemDetailModel: mocks.useItemDetailModel }));

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

function renderPage(initialEntry = '/inventory/items/item-1'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppContextProvider>
          <ShortcutProvider globalHandlers={{}}>
            <Routes>
              <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
            </Routes>
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
      retry,
    });
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'This item could not be loaded' })
    ).toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders destroyed items as read-only', () => {
    mocks.useItemDetailModel.mockReturnValue({
      status: 'ready',
      error: null,
      model: { ...model, item: { ...item, lifecycle: 'destroyed' } },
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
      retry: vi.fn(),
    });
    renderPage('/inventory/items/missing');
    expect(screen.getByRole('heading', { name: 'This item no longer exists' })).toBeInTheDocument();
  });
});
