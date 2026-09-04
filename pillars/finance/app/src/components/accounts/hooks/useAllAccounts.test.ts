import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllAccounts } from './useAllAccounts';

const mockAccountsList = vi.fn();
const mockInstitutionsList = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mockAccountsList(...args),
  institutionsList: (...args: unknown[]) => mockInstitutionsList(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const ANZ = { id: 'anz', name: 'ANZ', colour: '#0072ac', logoAssetId: null };
const EVERYDAY = {
  id: 'a1',
  name: 'Everyday',
  institutionId: 'anz',
  kind: 'checking',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountsList.mockResolvedValue({
    data: { data: [EVERYDAY], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
  mockInstitutionsList.mockResolvedValue({ data: { data: [ANZ] }, error: undefined });
});

describe('useAllAccounts', () => {
  it('requests the whole account list in one page, not a default-sized one', async () => {
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(mockAccountsList).toHaveBeenCalledExactlyOnceWith({ query: { limit: 500 } });
  });

  it('joins the account onto its institution before handing it back', async () => {
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(result.current.accounts?.[0]).toEqual({
      id: 'a1',
      name: 'Everyday',
      kind: 'checking',
      archived: false,
      institution: { id: 'anz', name: 'ANZ', colour: '#0072ac' },
    });
  });

  it('leaves accounts undefined until both queries resolve, so absence is never asserted early', () => {
    mockAccountsList.mockReturnValue(new Promise(() => {}));
    mockInstitutionsList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    expect(result.current.accounts).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('leaves accounts undefined while only the institutions query is still pending', async () => {
    mockInstitutionsList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAllAccounts(), { wrapper });

    await waitFor(() => expect(mockAccountsList).toHaveBeenCalled());
    expect(result.current.accounts).toBeUndefined();
  });

  it('surfaces a failure from either query as error', async () => {
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
