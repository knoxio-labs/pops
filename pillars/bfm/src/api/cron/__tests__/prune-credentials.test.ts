/**
 * The credential-prune worker's scheduling, against a real on-disk bfm.db.
 *
 * What is under test here is the timer shape — one tick at start, one per
 * `intervalMs`, no pile-up, and a clean stop. The retention decision itself
 * is `../../db/services/prune-credentials.ts`'s, and is proved there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceRow, openTempDb, pairingCodeRow } from '../../../db/__tests__/helpers.js';
import { devices, pairingCodes } from '../../../db/schema.js';
import {
  startPruneCredentialsWorker,
  type PruneCredentialsWorkerHandle,
} from '../prune-credentials.js';

import type { OpenedBfmDb } from '../../../db/index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;
let handles: PruneCredentialsWorkerHandle[];

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  handles = [];
  const device = deviceRow();
  opened.db.insert(devices).values(device).run();
});

afterEach(() => {
  for (const handle of handles) handle.stop();
  cleanup();
  vi.useRealTimers();
});

function start(
  overrides: Partial<Parameters<typeof startPruneCredentialsWorker>[0]> = {}
): PruneCredentialsWorkerHandle {
  const handle = startPruneCredentialsWorker({ db: opened.db, ...overrides });
  handles.push(handle);
  return handle;
}

/** A pairing code already long dead, well inside any window this suite uses. */
function deadCode(): void {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  opened.db
    .insert(pairingCodes)
    .values(
      pairingCodeRow({
        createdAt: oneYearAgo,
        expiresAt: new Date(Date.parse(oneYearAgo) + 60_000).toISOString(),
        consumedAt: new Date(Date.parse(oneYearAgo) + 30_000).toISOString(),
      })
    )
    .run();
}

describe('runOnce', () => {
  // `deadCode()` is seeded AFTER `start()` in both cases below: starting the
  // worker fires its own immediate tick (see "the tick timer" further down),
  // which would otherwise prune the row before the explicit `runOnce()` call
  // gets a chance to.

  it('reports how many rows each table lost', () => {
    const handle = start();
    deadCode();

    const stats = handle.runOnce();

    expect(stats).toEqual({ pairingCodesDeleted: 1, refreshTokensDeleted: 0 });
  });

  it('logs the tick', () => {
    const info = vi.fn();
    const handle = start({ logger: { info } });
    deadCode();

    handle.runOnce();

    expect(info).toHaveBeenCalledWith(
      'bfm credential prune tick complete',
      expect.objectContaining({ pairingCodesDeleted: 1 })
    );
  });
});

describe('the tick timer', () => {
  it('runs once immediately, then again only after intervalMs', async () => {
    vi.useFakeTimers();
    const info = vi.fn();

    start({ intervalMs: 1_000, logger: { info } });
    await vi.advanceTimersByTimeAsync(0);
    expect(info).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(info).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('arms the next tick only after the current one settles', async () => {
    vi.useFakeTimers();
    const info = vi.fn();

    const handle = start({ intervalMs: 1_000, logger: { info } });
    await vi.advanceTimersByTimeAsync(5_000);
    handle.stop();

    // Every 1000ms after the previous run settles, plus the immediate first
    // run — no overlap or pile-up, though a slower run would push the next
    // tick's wall-clock time back by its own duration. Each run here is near
    // instant against the in-memory DB, so that drift doesn't show up in the
    // count.
    expect(info).toHaveBeenCalledTimes(6);
  });

  it('stops arming once stopped', async () => {
    vi.useFakeTimers();
    const info = vi.fn();

    const handle = start({ intervalMs: 1_000, logger: { info } });
    await vi.advanceTimersByTimeAsync(0);
    const afterFirstTick = info.mock.calls.length;
    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(info.mock.calls.length).toBe(afterFirstTick);
  });

  it('keeps ticking after a pass throws', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const boom = new Error('boom');
    const now = vi
      .fn()
      .mockImplementationOnce(() => {
        throw boom;
      })
      .mockImplementation(() => new Date());

    start({ intervalMs: 1_000, logger: { warn }, now });
    await vi.advanceTimersByTimeAsync(2_500);

    expect(warn).toHaveBeenCalledWith('bfm credential prune tick failed', { error: 'boom' });
  });
});
