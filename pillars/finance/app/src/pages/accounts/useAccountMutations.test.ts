import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCOUNT_FORM_VALUES } from './types';
import { useAccountMutations } from './useAccountMutations';

const accountsCreate = vi.fn();
const accountsUpdate = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  accountsCreate: (...args: unknown[]) => accountsCreate(...args),
  accountsUpdate: (...args: unknown[]) => accountsUpdate(...args),
  giftCardDetailsWrite: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries');
  wrapper.client = client;
  return createElement(QueryClientProvider, { client }, children);
}
wrapper.client = undefined as unknown as QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  accountsCreate.mockResolvedValue({
    data: { data: { id: 'acc-new', name: 'New Account' }, message: 'Created' },
    error: undefined,
  });
  accountsUpdate.mockResolvedValue({
    data: { data: { id: 'acc-1', name: 'Renamed', archivedAt: null }, message: 'Updated' },
    error: undefined,
  });
});

/**
 * `useAllAccounts` (the import wizard's and `EditableFormFields`' account
 * picker) reads a cache key this hook never wrote to before POPS-2840's
 * review-findings-gate flagged it — any account create/update/archive here
 * must bust it too, not just this page's own `ACCOUNTS_KEY`.
 */
describe('useAccountMutations cache invalidation', () => {
  it('invalidates both the accounts page cache and useAllAccounts cache on create', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.createMutation.mutateAsync(DEFAULT_ACCOUNT_FORM_VALUES);

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
    expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['finance', 'accounts', 'page'],
    });
  });

  it('invalidates both caches on update', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.updateMutation.mutateAsync({
      id: 'acc-1',
      values: DEFAULT_ACCOUNT_FORM_VALUES,
    });

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
  });

  it('invalidates both caches on archive', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.archiveMutation.mutateAsync({
      id: 'acc-1',
      archivedAt: '2026-01-01T00:00:00.000Z',
    });

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
  });
});
