import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StaleReviewError, type ReviewGateway, type ReviewSnapshot } from './contracts';
import { emptyChoices, type ReviewItem } from './model';
import { noReadyRows } from './test-fixtures';
import { useReview } from './useReview';

import type { ReactNode } from 'react';

const item: ReviewItem = {
  id: 'row',
  proposalRevision: 'proposal-row',
  candidateTotal: 0,
  candidateOffset: 0,
  candidateLimit: 50,
  name: 'Alex',
  source: 'vCard',
  points: [],
  candidates: [],
  status: 'New',
  errors: [],
  processed: false,
};
const snapshot: ReviewSnapshot = {
  batchId: 'batch',
  proposalRevision: 'global-proof',
  totalRows: 1,
  offset: 0,
  limit: 50,
  ready: noReadyRows,
  counts: { automatic: 0, review: 1, new: 0, invalid: 0 },
  batchRevision: 2,
  directoryRevision: 7,
  items: [item],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('review persistence', () => {
  it('retries exactly the same revision, selections and idempotency key after a lost response', async () => {
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject(snapshot));
    await act(() => result.current.save(item, emptyChoices()));
    expect(result.current.uncertain).toBe(true);
    const firstRequest = vi.mocked(gateway.save).mock.calls[0]?.[0];
    expect(firstRequest?.idempotencyKey).toBeTruthy();
    await act(() => result.current.retry());
    expect(gateway.save).toHaveBeenNthCalledWith(2, firstRequest);
    expect(result.current.success).toBe(true);
  });
  it('requires evidence reload after revision conflicts and does not silently retry', async () => {
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockRejectedValue(new StaleReviewError('Directory changed')),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject(snapshot));
    await act(() => result.current.save(item, emptyChoices()));
    expect(result.current.stale).toBe(true);
    await act(() => result.current.retry());
    expect(gateway.save).toHaveBeenCalledTimes(1);
    await act(() => result.current.reload());
    expect(result.current.stale).toBe(false);
    expect(result.current.uncertain).toBe(false);
    expect(result.current.generation).toBe(1);
  });
  it('surfaces a failed snapshot without manufacturing a review queue', async () => {
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi.fn().mockRejectedValue(new Error('Unavailable')),
      save: vi.fn(),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Unavailable'));
    expect(result.current.data).toBeUndefined();
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it('keeps a failed explicit reload visible and prevents an unhandled rejection', async () => {
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValue(new Error('Reload unavailable')),
      save: vi.fn(),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject(snapshot));
    await act(() => result.current.reload());
    expect(result.current.error?.message).toBe('Reload unavailable');
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it('blocks writes while an explicit reload is still fetching replacement evidence', async () => {
    let finish: ((value: ReviewSnapshot) => void) | undefined;
    const pending = new Promise<ReviewSnapshot>((resolve) => {
      finish = resolve;
    });
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi.fn().mockResolvedValueOnce(snapshot).mockReturnValue(pending),
      save: vi.fn(),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject(snapshot));
    let reload: Promise<void> | undefined;
    act(() => {
      reload = result.current.reload();
    });
    expect(result.current.saving).toBe(true);
    await act(() => result.current.save(item, emptyChoices()));
    expect(gateway.save).not.toHaveBeenCalled();
    await act(async () => {
      finish?.(snapshot);
      await reload;
    });
    expect(result.current.saving).toBe(false);
  });
  it('starts a fresh snapshot on the first page after saving from a later page', async () => {
    const gateway: ReviewGateway = {
      applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject(snapshot));
    await act(() => result.current.pageRows(50));
    await waitFor(() => expect(gateway.load).toHaveBeenCalledTimes(2));
    expect(gateway.load).toHaveBeenNthCalledWith(2, 'batch', {
      offset: 50,
      proposalRevision: 'global-proof',
    });
    await act(() => result.current.save(item, emptyChoices()));
    expect(gateway.load).toHaveBeenNthCalledWith(3, 'batch', {
      offset: 0,
      proposalRevision: undefined,
    });
  });
});

it('refreshes cached query data on a new mount before requesting candidate pages', async () => {
  const client = new QueryClient();
  function SharedClient({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const gateway: ReviewGateway = {
    applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const initial = renderHook(() => useReview('batch', gateway), { wrapper: SharedClient });
  await waitFor(() => expect(initial.result.current.data).toMatchObject(snapshot));
  initial.unmount();
  const second = renderHook(() => useReview('batch', gateway), { wrapper: SharedClient });
  await waitFor(() => expect(gateway.load).toHaveBeenCalledTimes(2));
  await act(() => second.result.current.pageCandidates('row', 0));
  await waitFor(() => expect(gateway.load).toHaveBeenCalledTimes(3));
  expect(gateway.load).toHaveBeenLastCalledWith(
    'batch',
    expect.objectContaining({ candidateRowId: 'row', proposalRevision: 'global-proof' })
  );
});

describe('resolved whole-batch writes', () => {
  const readySnapshot: ReviewSnapshot = {
    ...snapshot,
    ready: {
      ...noReadyRows,
      proposalRevision: 'strong-ready-proof',
      eligibleRows: 2,
      automaticMerges: 1,
      newPeople: 1,
    },
  };
  it('reports ready progress until the server acknowledges and reloads evidence', async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<{ appliedRows: number }>((resolve) => {
      finish = () => resolve({ appliedRows: 2 });
    });
    const gateway: ReviewGateway = {
      load: vi.fn().mockResolvedValue(readySnapshot),
      save: vi.fn(),
      applyReady: vi.fn().mockReturnValue(pending),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => {
      void result.current.applyReady();
    });
    await waitFor(() => expect(result.current.readyApplying).toBe(true));
    expect(result.current.success).toBe(false);
    await act(async () => {
      finish?.();
      await pending;
    });
    await waitFor(() => expect(result.current.readyApplying).toBe(false));
    expect(result.current.readyApplied).toBe(2);
    expect(gateway.load).toHaveBeenCalledTimes(2);
  });
  it('retains the exact ready proof, operation and retry key after a lost response', async () => {
    const gateway: ReviewGateway = {
      load: vi.fn().mockResolvedValue(readySnapshot),
      save: vi.fn(),
      applyReady: vi
        .fn()
        .mockRejectedValueOnce(new Error('Lost response'))
        .mockResolvedValue({ appliedRows: 2 }),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(() => result.current.applyReady());
    const first = vi.mocked(gateway.applyReady).mock.calls[0]?.[0];
    expect(first).toMatchObject({
      batchRevision: 2,
      directoryRevision: 7,
      proposalRevision: 'strong-ready-proof',
    });
    expect(first).not.toHaveProperty('rowId');
    expect(result.current.uncertain).toBe(true);
    await act(() => result.current.retry());
    expect(gateway.applyReady).toHaveBeenNthCalledWith(2, first);
    expect(result.current.readyApplied).toBe(2);
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it('never retries a stale ready plan without a fresh proof and new explicit action', async () => {
    const gateway: ReviewGateway = {
      load: vi.fn().mockResolvedValue(readySnapshot),
      save: vi.fn(),
      applyReady: vi.fn().mockRejectedValue(new StaleReviewError()),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(() => result.current.applyReady());
    expect(result.current.stale).toBe(true);
    await act(() => result.current.retry());
    await act(() => result.current.applyReady());
    expect(gateway.applyReady).toHaveBeenCalledTimes(1);
  });
  it('does not infer ready actions from automatic labels when the server says none are eligible', async () => {
    const gateway: ReviewGateway = {
      load: vi
        .fn()
        .mockResolvedValue({ ...snapshot, counts: { ...snapshot.counts, automatic: 99 } }),
      save: vi.fn(),
      applyReady: vi.fn(),
    };
    const { result } = renderHook(() => useReview('batch', gateway), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(() => result.current.applyReady());
    expect(gateway.applyReady).not.toHaveBeenCalled();
  });
});
