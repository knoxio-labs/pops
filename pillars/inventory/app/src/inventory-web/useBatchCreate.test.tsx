import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useBatchCreate, type BatchDestination, type BatchRow } from './useBatchCreate';

import type { WebBatchCreateResponse } from '../inventory-api/types.gen';

const mocks = vi.hoisted(() => ({ webBatchCreate: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webBatchCreate: (...args: unknown[]) => mocks.webBatchCreate(...args),
}));

type RequestBody = {
  rows: BatchRow[];
  dryRun: boolean;
  destination?: BatchDestination;
};

function row(index: number): BatchRow {
  return {
    name: `Item ${index}`,
    type: 'cable',
    quantity: '1',
    code: `CAB-${index}`,
    where: '',
    note: '',
  };
}

function ok(data: WebBatchCreateResponse) {
  return { data, error: undefined, response: { status: 200 } };
}

function validOutcomes(rows: readonly BatchRow[]): WebBatchCreateResponse['outcomes'] {
  return rows.map((_, row) => ({ status: 'valid' as const, row }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webBatchCreate.mockResolvedValue(ok({ outcomes: [] }));
});

describe('useBatchCreate', () => {
  it('sends 450 rows as 200, 200 and 50 and reports global row indices', async () => {
    mocks.webBatchCreate.mockImplementation(async ({ body }: { body: RequestBody }) =>
      ok({ outcomes: validOutcomes(body.rows) })
    );
    const rows = Array.from({ length: 450 }, (_, index) => row(index));
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    const run = await result.current.validate(rows);

    expect(mocks.webBatchCreate).toHaveBeenCalledTimes(3);
    expect(mocks.webBatchCreate.mock.calls.map(([call]) => call.body.rows)).toHaveLength(3);
    expect(mocks.webBatchCreate.mock.calls.map(([call]) => call.body.rows.length)).toEqual([
      200, 200, 50,
    ]);
    expect(run.outcomes.map((outcome) => outcome.row)).toEqual(
      Array.from({ length: 450 }, (_, index) => index)
    );
  });

  it('validates with dryRun true and does not invalidate web queries', async () => {
    mocks.webBatchCreate.mockResolvedValue(ok({ outcomes: [{ status: 'valid', row: 0 }] }));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(queryClient),
    });

    const run = await result.current.validate([row(0)]);

    expect(run.outcomes).toEqual([{ status: 'valid', row: 0 }]);
    expect(mocks.webBatchCreate).toHaveBeenCalledWith({
      body: { rows: [row(0)], dryRun: true },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('commits with dryRun false and invalidates web queries once after a creation', async () => {
    mocks.webBatchCreate.mockResolvedValue(
      ok({ outcomes: [{ status: 'created', row: 0, itemId: 'i1' }] })
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.commit([row(0)]);

    expect(mocks.webBatchCreate).toHaveBeenCalledWith({
      body: { rows: [row(0)], dryRun: false },
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });

  it('marks the failed chunk and every later row not-sent without retrying', async () => {
    mocks.webBatchCreate
      .mockResolvedValueOnce(ok({ outcomes: validOutcomes(Array.from({ length: 200 }, row)) }))
      .mockRejectedValueOnce(new InventoryApiError('offline', undefined));
    const rows = Array.from({ length: 450 }, (_, index) => row(index));
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    const run = await result.current.validate(rows);

    expect(mocks.webBatchCreate).toHaveBeenCalledTimes(2);
    expect(run.outcomes).toHaveLength(450);
    expect(run.outcomes.slice(0, 200).every((outcome) => outcome.status === 'valid')).toBe(true);
    expect(run.outcomes.slice(200).every((outcome) => outcome.status === 'not-sent')).toBe(true);
    expect(run.outcomes[200]).toMatchObject({ row: 200, status: 'not-sent' });
  });

  it('passes a destination through and omits it when absent', async () => {
    mocks.webBatchCreate.mockResolvedValue(ok({ outcomes: [{ status: 'valid', row: 0 }] }));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(queryClient),
    });
    const destination: BatchDestination = { kind: 'location', locationId: 'loc-1' };

    await result.current.validate([row(0)], destination);
    await result.current.validate([row(1)]);

    const [firstCall, secondCall] = mocks.webBatchCreate.mock.calls;
    expect(firstCall?.[0]).toEqual({
      body: { rows: [row(0)], destination, dryRun: true },
    });
    expect(secondCall?.[0]).toEqual({
      body: { rows: [row(1)], dryRun: true },
    });
  });

  it('returns an empty run without making a request', async () => {
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await expect(result.current.commit([])).resolves.toEqual({ outcomes: [] });
    expect(mocks.webBatchCreate).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });

  it('keeps isRunning true until the request resolves', async () => {
    let resolveRequest: ((value: ReturnType<typeof ok>) => void) | undefined;
    const request = new Promise<ReturnType<typeof ok>>((resolve) => {
      resolveRequest = resolve;
    });
    mocks.webBatchCreate.mockReturnValue(request);
    const { result } = renderHook(() => useBatchCreate(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    const run = result.current.validate([row(0)]);
    await waitFor(() => expect(result.current.isRunning).toBe(true));
    resolveRequest?.(ok({ outcomes: [{ status: 'valid', row: 0 }] }));
    await run;
    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });
});
