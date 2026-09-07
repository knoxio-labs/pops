import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS } from '../../../test-utils.js';
import { useAllAccounts } from './useAllAccounts';

const mockAccountsList = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mockAccountsList(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const EVERYDAY = {
  id: 'a1',
  name: 'Everyday',
  kind: 'checking',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: 'entity-anz',
  entityDisplayName: 'ANZ',
  entityDisplayNameStale: false,
  entityColour: '#0072ac',
  entityAvatarAssetId: null,
  resolvedEntityId: 'entity-anz',
  balance: NO_BALANCE,
  importStatus: NO_IMPORT_STATUS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountsList.mockResolvedValue({
    data: { data: [EVERYDAY], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
});

describe('useAllAccounts', () => {
  it('requests the whole account list in one page, not a default-sized one', async () => {
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(mockAccountsList).toHaveBeenCalledExactlyOnceWith({ query: { limit: 500 } });
  });

  it('reads the resolved issuer straight off the account response, with no separate institutions fetch', async () => {
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(result.current.accounts?.[0]).toEqual({
      id: 'a1',
      name: 'Everyday',
      kind: 'checking',
      archived: false,
      institution: { id: 'entity-anz', name: 'ANZ', colour: '#0072ac' },
    });
  });

  it('leaves accounts undefined until the query resolves, so absence is never asserted early', () => {
    mockAccountsList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    expect(result.current.accounts).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('surfaces a failure from the query as error', async () => {
    const failure = new Error('accounts unavailable');
    mockAccountsList.mockResolvedValue({
      data: undefined,
      error: failure,
      response: { status: 503 },
    });
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.accounts).toBeUndefined();
  });
});
