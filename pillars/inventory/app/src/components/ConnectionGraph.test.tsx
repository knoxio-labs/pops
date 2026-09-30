import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { connectionsGraph } from '../inventory-api/index.js';

const connectionsGraphMock = vi.hoisted(() => vi.fn<typeof connectionsGraph>());

vi.mock('../inventory-api/index.js', () => ({
  connectionsGraph: connectionsGraphMock,
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
});
