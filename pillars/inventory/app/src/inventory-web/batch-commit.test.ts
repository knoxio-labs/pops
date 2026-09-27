import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers.js';
import { commitWithProgress, type BatchProgress } from './batch-commit.js';

import type { BatchCreate, BatchRow, BatchRowOutcome, BatchRun } from './useBatchCreate.js';

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

function rows(length: number): BatchRow[] {
  return Array.from({ length }, (_, index) => row(index));
}

function validOutcomes(batch: readonly BatchRow[]): BatchRowOutcome[] {
  return batch.map((_, row) => ({ status: 'valid', row }));
}

function createdOutcomes(batch: readonly BatchRow[], firstItemId: number): BatchRowOutcome[] {
  return batch.map((_, row) => ({
    status: 'created',
    row,
    itemId: `item-${firstItemId + row}`,
  }));
}

function run(outcomes: readonly BatchRowOutcome[]): BatchRun {
  return { outcomes: [...outcomes] };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('commitWithProgress', () => {
  it('returns an empty run without calling commit or progress', async () => {
    const commit = vi.fn<BatchCreate['commit']>();
    const onProgress = vi.fn<(value: BatchProgress) => void>();

    await expect(commitWithProgress(commit, [], undefined, onProgress)).resolves.toEqual({
      outcomes: [],
    });
    expect(commit).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('commits 450 rows in consecutive slices with global row indexes', async () => {
    const commit = vi.fn<BatchCreate['commit']>(async (slice) => run(validOutcomes(slice)));
    const onProgress = vi.fn<(value: BatchProgress) => void>();
    const input = rows(450);

    const result = await commitWithProgress(commit, input, undefined, onProgress);

    expect(commit.mock.calls.map(([slice]) => slice.length)).toEqual([200, 200, 50]);
    expect(commit.mock.calls.map(([slice]) => slice[0]?.name)).toEqual([
      'Item 0',
      'Item 200',
      'Item 400',
    ]);
    expect(result.outcomes.map((outcome) => outcome.row)).toEqual(
      Array.from({ length: input.length }, (_, index) => index)
    );
  });

  it('reports progress after each awaited slice with running created counts', async () => {
    const events: string[] = [];
    const commit = vi.fn<BatchCreate['commit']>(async (slice) => {
      events.push(`commit:${slice[0]?.name}`);
      await Promise.resolve();
      const start = Number(slice[0]?.name.replace('Item ', ''));
      return run(createdOutcomes(slice, start));
    });
    const reported: BatchProgress[] = [];

    const result = await commitWithProgress(commit, rows(450), undefined, (value) => {
      events.push(`progress:${value.sent}`);
      reported.push(value);
    });

    expect(reported).toEqual([
      { sent: 200, total: 450, created: 200 },
      { sent: 400, total: 450, created: 400 },
      { sent: 450, total: 450, created: 450 },
    ]);
    expect(events).toEqual([
      'commit:Item 0',
      'progress:200',
      'commit:Item 200',
      'progress:400',
      'commit:Item 400',
      'progress:450',
    ]);
    expect(result.outcomes.every((outcome) => outcome.status === 'created')).toBe(true);
  });

  it('preserves partial acceptance and reports only created rows', async () => {
    const commit = vi.fn<BatchCreate['commit']>(async (slice) => {
      const start = Number(slice[0]?.name.replace('Item ', ''));
      const outcomes = slice.map((_, row): BatchRowOutcome => {
        if (row === 0) return { status: 'created', row, itemId: `item-${start}` };
        if (row === 1) return { status: 'invalid', row, issues: [] };
        return { status: 'valid', row };
      });
      return run(outcomes);
    });
    const reported: BatchProgress[] = [];

    const result = await commitWithProgress(commit, rows(201), undefined, (value) => {
      reported.push(value);
    });

    expect(reported).toEqual([
      { sent: 200, total: 201, created: 1 },
      { sent: 201, total: 201, created: 2 },
    ]);
    expect(result.outcomes).toHaveLength(201);
    expect(result.outcomes[0]).toEqual({ status: 'created', row: 0, itemId: 'item-0' });
    expect(result.outcomes[1]).toEqual({ status: 'invalid', row: 1, issues: [] });
    expect(result.outcomes[200]).toEqual({ status: 'created', row: 200, itemId: 'item-200' });
  });

  it('stops after a not-sent slice and marks every later row with its error', async () => {
    const error = new InventoryApiError('offline', 503);
    const commit = vi
      .fn<BatchCreate['commit']>()
      .mockResolvedValueOnce(run(validOutcomes(rows(200))))
      .mockResolvedValueOnce(
        run(
          rows(200).map((_, row) => ({
            status: 'not-sent' as const,
            row,
            error,
          }))
        )
      );
    const onProgress = vi.fn<(value: BatchProgress) => void>();

    const result = await commitWithProgress(commit, rows(450), undefined, onProgress);

    expect(commit).toHaveBeenCalledTimes(2);
    expect(result.outcomes).toHaveLength(450);
    expect(result.outcomes.map((outcome) => outcome.row)).toEqual(
      Array.from({ length: 450 }, (_, index) => index)
    );
    expect(result.outcomes.slice(200).every((outcome) => outcome.status === 'not-sent')).toBe(true);
    expect(
      result.outcomes.slice(400).every((outcome) => {
        return outcome.status === 'not-sent' && outcome.error === error;
      })
    ).toBe(true);
    expect(onProgress.mock.calls.map(([value]) => value.sent)).toEqual([200, 400]);
  });

  it('propagates a commit error without reporting progress or sending later slices', async () => {
    const error = new InventoryApiError('unexpected commit failure', 503);
    const commit = vi.fn<BatchCreate['commit']>().mockRejectedValue(error);
    const onProgress = vi.fn<(value: BatchProgress) => void>();

    await expect(commitWithProgress(commit, rows(201), undefined, onProgress)).rejects.toBe(error);
    expect(commit).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalled();
  });
});
