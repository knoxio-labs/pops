import { vi } from 'vitest';

export const mockClient = {
  inventory: {
    locations: {
      tree: { query: vi.fn().mockResolvedValue({ data: [{ id: 'loc_1', name: 'Living Room' }] }) },
      list: { query: vi.fn().mockResolvedValue({ data: [], total: 0 }) },
    },
    items: {
      list: {
        query: vi
          .fn()
          .mockResolvedValue({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      },
      get: { query: vi.fn().mockResolvedValue({ data: { id: 'item_1', name: 'MacBook' } }) },
    },
    connections: {
      listForItem: {
        query: vi
          .fn()
          .mockResolvedValue({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      },
      graph: { query: vi.fn().mockResolvedValue({ data: { nodes: [], edges: [] } }) },
    },
  },
  finance: {
    transactions: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
    budgets: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  core: {
    entities: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  media: {
    library: {
      list: { query: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    },
    watchlist: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  cerebrum: {
    engrams: {
      list: { query: vi.fn().mockResolvedValue({ engrams: [], total: 0 }) },
      get: { query: vi.fn().mockResolvedValue({ id: 'eng_1', title: 'Test', body: 'content' }) },
    },
    retrieval: {
      search: { query: vi.fn().mockResolvedValue({ results: [] }) },
    },
  },
};

interface TextResultLike {
  content: readonly { type: string; text?: string }[];
  isError?: boolean;
}

export function extractText(result: TextResultLike): string {
  const first = result.content[0];
  if (!first || typeof first.text !== 'string') {
    throw new Error(`MCP result has no text content: ${JSON.stringify(result)}`);
  }
  return first.text;
}

export function parseResult(result: TextResultLike): unknown {
  return JSON.parse(extractText(result));
}
