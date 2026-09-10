import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  triggerSync: vi.fn(),
  getSyncJob: vi.fn(),
}));

vi.mock('../../../finance-api/index.js', () => ({
  accountImportsTriggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  accountImportsGetSyncJob: (...args: unknown[]) => mocks.getSyncJob(...args),
}));

import { useSyncNow } from './useSyncNow';

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response() };
}

function job(status: string) {
  return {
    id: 'job-1',
    accountId: 'acc-up',
    trigger: 'manual',
    status,
    from: '2019-05-01',
    to: '2019-05-31',
    startedAt: '2026-09-10T00:00:00.000Z',
    finishedAt: null,
    result: null,
    error: null,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSyncNow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.triggerSync.mockResolvedValue(ok({ data: job('running') }));
    mocks.getSyncJob.mockResolvedValue(ok({ data: job('completed') }));
  });

  it('sends no body at all for a steady-state sync', async () => {
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncNow());

    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledWith({ path: { id: 'acc-up' } }));
  });

  it('sends the explicit range when one is given (POPS-3352)', async () => {
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncRange({ from: '2019-05-01', to: '2019-05-31' }));

    await waitFor(() =>
      expect(mocks.triggerSync).toHaveBeenCalledWith({
        path: { id: 'acc-up' },
        body: { from: '2019-05-01', to: '2019-05-31' },
      })
    );
  });
});
