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

import { UNEXPLAINED_SYNC_FAILURE, useSyncNow } from './useSyncNow';

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response() };
}

const EMPTY_RESULT = {
  fetched: 0,
  staged: 0,
  alreadyStaged: 0,
  alreadyInLedger: 0,
  settled: 0,
  settleRefused: 0,
  alreadyHeld: 0,
  draftId: null,
  warnings: [],
};

function job(status: string, overrides: { result?: unknown; error?: string | null } = {}) {
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
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

  it('surfaces a failed job as an error carrying its own reason (POPS-3657)', async () => {
    mocks.getSyncJob.mockResolvedValue(
      ok({ data: job('failed', { error: 'Up rejected the token.' }) })
    );
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncRange({ from: '2019-05-01', to: '2019-05-31' }));

    await waitFor(() => expect(result.current.error?.message).toBe('Up rejected the token.'));
    expect(result.current.lastJob).toBeNull();
    expect(result.current.isSyncing).toBe(false);
  });

  it('still reports a failed job that recorded no reason', async () => {
    mocks.getSyncJob.mockResolvedValue(ok({ data: job('failed') }));
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncNow());

    await waitFor(() =>
      expect(result.current.error?.message).toBe('The sync failed without saying why.')
    );
    expect(UNEXPLAINED_SYNC_FAILURE).toBe('The sync failed without saying why.');
  });

  it('drops the previous pass result when the next one fails', async () => {
    mocks.getSyncJob
      .mockResolvedValueOnce(ok({ data: job('completed', { result: EMPTY_RESULT }) }))
      .mockResolvedValue(ok({ data: job('failed', { error: 'Up is down.' }) }));
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncNow());
    await waitFor(() => expect(result.current.lastJob?.result).toEqual(EMPTY_RESULT));

    act(() => result.current.syncNow());
    await waitFor(() => expect(result.current.error?.message).toBe('Up is down.'));
    expect(result.current.lastJob).toBeNull();
  });

  it('treats a completed job that staged nothing as a result, not a failure', async () => {
    mocks.getSyncJob.mockResolvedValue(ok({ data: job('completed', { result: EMPTY_RESULT }) }));
    const { result } = renderHook(() => useSyncNow('acc-up'), { wrapper });

    act(() => result.current.syncNow());

    await waitFor(() => expect(result.current.lastJob?.result?.staged).toBe(0));
    expect(result.current.error).toBeNull();
  });
});
