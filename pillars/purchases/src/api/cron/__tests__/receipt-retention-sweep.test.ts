/**
 * Retention sweep worker tests, following `reconcile-cross-pillar.test.ts`'s
 * fake-timer style. The sweep call is stubbed via the worker's `sweep`
 * injection seam — the point under test is the tick/stop/drain contract,
 * not the sweep logic itself (covered by `retention-sweep.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startReceiptRetentionSweepWorker } from '../receipt-retention-sweep.js';

import type { PurchasesDb } from '../../../db/index.js';
import type { SweepUnreferencedReceiptsResult } from '../../../ingest/receipt/retention-sweep.js';
import type { ReceiptRetentionSweepWorkerHandle } from '../receipt-retention-sweep.js';

const DB = {} as PurchasesDb;
const EMPTY_RESULT: SweepUnreferencedReceiptsResult = {
  scanned: 0,
  deleted: 0,
  kept: 0,
  malformed: 0,
};

let handles: ReceiptRetentionSweepWorkerHandle[];

beforeEach(() => {
  handles = [];
});

afterEach(async () => {
  for (const handle of handles) handle.stop();
  await Promise.all(handles.map((handle) => handle.drain()));
  vi.useRealTimers();
});

function start(
  overrides: Partial<Parameters<typeof startReceiptRetentionSweepWorker>[0]> = {}
): ReceiptRetentionSweepWorkerHandle {
  const handle = startReceiptRetentionSweepWorker({ db: DB, intervalMs: 1000, ...overrides });
  handles.push(handle);
  return handle;
}

describe('runOnce', () => {
  it('runs the sweep exactly once and returns its counts', async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockReturnValue({ scanned: 3, deleted: 1, kept: 2, malformed: 0 });

    const handle = start({ sweep });
    const result = await handle.runOnce();

    expect(result).toEqual({ scanned: 3, deleted: 1, kept: 2, malformed: 0 });
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe('the tick timer', () => {
  it('reschedules after a pass settles', async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockReturnValue(EMPTY_RESULT);

    start({ sweep, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    const afterFirstTick = sweep.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);

    expect(sweep.mock.calls.length).toBeGreaterThan(afterFirstTick);
  });

  it('stop() cancels the pending timer', async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockReturnValue(EMPTY_RESULT);

    const handle = start({ sweep, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    const afterFirstTick = sweep.mock.calls.length;
    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sweep.mock.calls.length).toBe(afterFirstTick);
  });

  it('does not crash the tick loop when a sweep throws, and still re-arms', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const sweep = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('locked file');
      })
      .mockReturnValue(EMPTY_RESULT);

    start({ sweep, intervalMs: 1000, logger: { warn } });
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(
      'purchases receipt retention sweep failed',
      expect.objectContaining({ error: 'locked file' })
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('drain', () => {
  it('waits for an in-flight pass before resolving', async () => {
    let resolvePass: ((value: SweepUnreferencedReceiptsResult) => void) | undefined;
    const sweep = vi.fn(
      () =>
        new Promise<SweepUnreferencedReceiptsResult>((resolve) => {
          resolvePass = resolve;
        })
    );

    const handle = start({ sweep, intervalMs: 1_000_000 });
    handle.stop();

    let drained = false;
    const drainPromise = handle.drain().then(() => {
      drained = true;
    });

    // Give the pending microtask queue a chance to run; the pass is still
    // stuck on the unresolved promise the stub handed back.
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);

    resolvePass?.(EMPTY_RESULT);
    await drainPromise;
    expect(drained).toBe(true);
  });
});
