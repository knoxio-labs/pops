import { vi } from 'vitest';

import { callOk } from './test-helpers-call-results.js';
import { mockPillarInventory } from './test-helpers-pillar-mocks-inventory.js';

export { callContractMismatch, callOk, callUnavailable } from './test-helpers-call-results.js';

export {
  MOCK_FIXTURE,
  MOCK_FIXTURE_CONN,
  mockPillarInventory,
} from './test-helpers-pillar-mocks-inventory.js';

export const mockPillarFinance = {
  finance: {
    transactions: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
      get: vi.fn().mockResolvedValue(callOk({ data: null })),
    },
    budgets: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
      get: vi.fn().mockResolvedValue(callOk({ data: null })),
    },
    corrections: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
    tagRules: { vocabulary: vi.fn().mockResolvedValue(callOk({ tags: [] })) },
    wishlist: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
      get: vi.fn().mockResolvedValue(callOk({ data: null })),
    },
    accounts: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
    checkpoints: {
      list: vi.fn().mockResolvedValue(callOk({ data: [] })),
    },
    imports: { getImportProgress: vi.fn().mockResolvedValue(callOk(null)) },
    search: { search: vi.fn().mockResolvedValue(callOk({ hits: [] })) },
    summary: {
      get: vi.fn().mockResolvedValue(
        callOk({
          data: {
            window: { key: '30d', start: null, end: '2026-09-12', previous: null },
            empty: true,
            currencies: [],
            total: { cents: 0, transactionCount: 0 },
          },
        })
      ),
    },
  },
};

export const mockPillarMedia = {
  media: {
    library: { list: vi.fn().mockResolvedValue(callOk({ items: [], total: 0 })) },
    watchlist: { list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })) },
  },
};

export const mockPillarCerebrum = {
  cerebrum: {
    engrams: {
      list: vi.fn().mockResolvedValue(callOk({ engrams: [], total: 0 })),
      get: vi.fn().mockResolvedValue(callOk({ id: 'eng_1', title: 'Test', body: 'content' })),
    },
    retrieval: { search: vi.fn().mockResolvedValue(callOk({ results: [] })) },
  },
};

export const mockPillarContacts = {
  contacts: {
    entities: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
  },
};

export const mockPillarPurchases = {
  purchases: {
    purchase: {
      list: vi.fn().mockResolvedValue(callOk({ items: [] })),
      get: vi.fn().mockResolvedValue(callOk(null)),
      itemsByTag: vi.fn().mockResolvedValue(callOk({ items: [] })),
    },
    analytics: {
      merchantSpend: vi
        .fn()
        .mockResolvedValue(callOk({ period: { from: null, to: null }, merchants: [], totals: [] })),
    },
    search: { search: vi.fn().mockResolvedValue(callOk({ hits: [] })) },
  },
};

const PILLAR_MOCKS = {
  inventory: mockPillarInventory,
  finance: mockPillarFinance,
  media: mockPillarMedia,
  cerebrum: mockPillarCerebrum,
  contacts: mockPillarContacts,
  purchases: mockPillarPurchases,
} as const;

/**
 * Used as the `getPillar` mock implementation in tool tests: dispatches by
 * pillarId and returns the pillar's collapsed handle. The SDK proxy exposes
 * `<domain>.<proc>` directly (no `<pillar>` level), so the mock strips the
 * pillar-name key here, mirroring how the real wrappers now call
 * `getPillar('<pillar>').<domain>.<proc>`.
 */
export function pillarMockGetter<TRouter>(pillarId: string): TRouter {
  const handle = PILLAR_MOCKS[pillarId as keyof typeof PILLAR_MOCKS];
  if (!handle) throw new Error(`No mock pillar handle for '${pillarId}'`);
  return (handle as Record<string, unknown>)[pillarId] as TRouter;
}

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
