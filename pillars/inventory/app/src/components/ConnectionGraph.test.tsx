import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { connectionsGraph } from '../inventory-api/index.js';

const connectionsGraphMock = vi.hoisted(() => vi.fn<typeof connectionsGraph>());

vi.mock('../inventory-api/index.js', () => ({
  connectionsGraph: connectionsGraphMock,
}));

vi.mock('./connection-graph/useGraphInteraction', () => ({
  useGraphInteraction: vi.fn(),
}));

vi.mock('./connection-graph/useGraphSimulation', () => ({
  useGraphSimulation: vi.fn(),
}));

import { ConnectionGraph } from './ConnectionGraph';

beforeEach(() => {
  connectionsGraphMock.mockReset();
  connectionsGraphMock.mockResolvedValue({
    data: { data: { edges: [], nodes: [] } },
    error: undefined,
  });
});

describe('ConnectionGraph', () => {
  it('includes the requested depth in the query key', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ConnectionGraph itemId="item-1" />
      </QueryClientProvider>
    );

    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ['inventory', 'connections', 'graph', 'item-1', 10] })
    ).toBeDefined();
    expect(connectionsGraphMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { maxDepth: 10 } })
    );
  });

  it('shows full connected item names as tap targets on mobile', async () => {
    const itemName = 'A connected item with a name too long to fit on the graph';
    connectionsGraphMock.mockResolvedValue({
      data: {
        data: {
          edges: [{ source: 'item-1', target: 'item-2' }],
          nodes: [
            { id: 'item-1', itemName: 'Current item', assetId: null, type: 'box' },
            { id: 'item-2', itemName, assetId: null, type: 'box' },
          ],
        },
      },
      error: undefined,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/inventory/items/item-1']}>
          <Routes>
            <Route path="/inventory/items/item-1" element={<ConnectionGraph itemId="item-1" />} />
            <Route path="/inventory/items/item-2" element={<p>Connected item details</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const itemButton = await screen.findByRole('button', { name: itemName });
    expect(itemButton).toHaveClass('h-11');
    await userEvent.click(itemButton);
    expect(await screen.findByText('Connected item details')).toBeInTheDocument();
  });
});
