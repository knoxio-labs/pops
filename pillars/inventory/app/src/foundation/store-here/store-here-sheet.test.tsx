import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kitchen13Target, storeWorld } from '../test-fixtures/store-here';
import { StoreHereSheet } from './store-here-sheet.js';

const mocks = vi.hoisted(() => ({
  usePlacementSources: vi.fn(),
  useWebSearch: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  useBatchCreate: vi.fn(),
  commit: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useWebSearch.js', () => ({ useWebSearch: mocks.useWebSearch }));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/useBatchCreate.js', () => ({ useBatchCreate: mocks.useBatchCreate }));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));

describe('StoreHereSheet', () => {
  beforeEach(() => {
    mocks.usePlacementSources.mockReset();
    mocks.useWebSearch.mockReset();
    mocks.useBulkItemVerbs.mockReset();
    mocks.useBatchCreate.mockReset();
    mocks.commit.mockReset();
    mocks.navigate.mockReset();
    mocks.usePlacementSources.mockReturnValue({
      world: storeWorld,
      isError: false,
      isLoading: false,
      locationsQuery: { refetch: vi.fn() },
      openContainersQuery: { refetch: vi.fn() },
      closedContainersQuery: { refetch: vi.fn() },
      subjectItemsQuery: { refetch: vi.fn() },
    });
    mocks.useWebSearch.mockReturnValue({
      results: { exact: null, items: [], places: [], total: 0 },
      status: 'error',
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
    mocks.useBulkItemVerbs.mockReturnValue({ store: vi.fn() });
    mocks.commit.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'new-item' }],
    });
    mocks.useBatchCreate.mockReturnValue({ commit: mocks.commit, isRunning: false });
  });

  it('keeps New item Create enabled when the optional web search fails', async () => {
    render(<StoreHereSheet open onOpenChange={vi.fn()} target={kitchen13Target} offline={false} />);

    const input = screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' });
    fireEvent.change(input, { target: { value: 'New item' } });

    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.commit).toHaveBeenCalledWith(
        [{ code: '', name: 'New item', note: '', quantity: '1', type: '', where: '' }],
        { kind: 'container', itemId: 'box-k13' }
      )
    );
  });
});
