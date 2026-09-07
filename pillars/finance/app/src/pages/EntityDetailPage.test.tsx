import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityDetailPage } from './EntityDetailPage';

import type { Entity } from '../contacts-api/types.gen.js';

const entitiesGetMock = vi.hoisted(() => vi.fn());
const entitiesUpdateMock = vi.hoisted(() => vi.fn());
const transactionsListMock = vi.hoisted(() => vi.fn());
const purchaseListMock = vi.hoisted(() => vi.fn());

vi.mock('../contacts-api/index.js', () => ({
  entitiesGet: (...args: unknown[]) => entitiesGetMock(...args),
  entitiesUpdate: (...args: unknown[]) => entitiesUpdateMock(...args),
}));
vi.mock('../contacts-api/client.gen.js', () => ({ client: { put: vi.fn() } }));
vi.mock('../finance-api/index.js', () => ({
  transactionsList: (...args: unknown[]) => transactionsListMock(...args),
}));
vi.mock('../purchases-api/index.js', () => ({
  purchaseList: (...args: unknown[]) => purchaseListMock(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Bunnings Warehouse',
    type: 'company',
    abn: '26 008 672 179',
    aliases: ['Bunnings'],
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    avatarAssetId: null,
    posterAssetId: null,
    colour: '#0d5257',
    ...overrides,
  };
}

function renderDetail(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/finance/entities/${id}`]}>
        <Routes>
          <Route path="/finance/entities/:id" element={<EntityDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionsListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 6, offset: 0, hasMore: false } },
    error: undefined,
  });
  purchaseListMock.mockResolvedValue({ data: { items: [] }, error: undefined });
});

describe('EntityDetailPage', () => {
  it('shows an error panel with a retry when the entity fetch fails', async () => {
    entitiesGetMock.mockRejectedValue(new Error('network down'));

    renderDetail('ent-1');

    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows "No such entity" when the fetch resolves with nothing', async () => {
    entitiesGetMock.mockResolvedValue({ data: { data: undefined }, error: undefined });

    renderDetail('ent-1');

    expect(await screen.findByText('No such entity')).toBeInTheDocument();
  });

  it('renders the header and field list once the entity loads', async () => {
    entitiesGetMock.mockResolvedValue({ data: { data: entity() }, error: undefined });

    renderDetail('ent-1');

    expect(await screen.findByRole('heading', { name: 'Bunnings Warehouse' })).toBeInTheDocument();
    expect(screen.getByText('26 008 672 179')).toBeInTheDocument();
    expect(screen.getByText('also known as Bunnings')).toBeInTheDocument();
  });

  it('shows both activity rollups with their own empty state when neither has matches', async () => {
    entitiesGetMock.mockResolvedValue({ data: { data: entity() }, error: undefined });

    renderDetail('ent-1');

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
    expect(screen.getByText('No purchases linked to this entity.')).toBeInTheDocument();
  });

  it('Edit opens the dialog correctly prefilled from the loaded entity, not blank or stale', async () => {
    const user = userEvent.setup();
    entitiesGetMock.mockResolvedValue({ data: { data: entity() }, error: undefined });

    renderDetail('ent-1');
    await screen.findByRole('heading', { name: 'Bunnings Warehouse' });

    await user.click(screen.getByRole('button', { name: /Edit/ }));

    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Bunnings Warehouse');
    expect(screen.getByLabelText('ABN (Optional)')).toHaveValue('26 008 672 179');
  });

  it('Edit submits an update scoped to the loaded entity id', async () => {
    const user = userEvent.setup();
    entitiesGetMock.mockResolvedValue({ data: { data: entity() }, error: undefined });
    entitiesUpdateMock.mockResolvedValue({ data: { data: entity() }, error: undefined });

    renderDetail('ent-1');
    await screen.findByRole('heading', { name: 'Bunnings Warehouse' });
    await user.click(screen.getByRole('button', { name: /Edit/ }));
    await screen.findByLabelText('Name');

    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(entitiesUpdateMock).toHaveBeenCalledWith({
        path: { id: 'ent-1' },
        body: expect.objectContaining({ name: 'Bunnings Warehouse' }),
      })
    );
  });
});
