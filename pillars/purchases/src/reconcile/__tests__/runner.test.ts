import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase } from '../../db/index.js';
import { createSweepRunner } from '../runner.js';

import type { CandidateFetch, FinanceClient } from '../../api/finance/client.js';
import type { OpenedPurchasesDb, PurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let db: PurchasesDb;
/** Every call the runner made to finance, which is one per sweep. */
let fetches: number;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  db = opened.db;
  seedAmazonSource(opened);
  fetches = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const finance: FinanceClient = {
  fetchCandidates: () => {
    fetches += 1;
    return Promise.resolve<CandidateFetch>({ kind: 'ok', transactions: [] });
  },
};

function order(checksum: string) {
  return createPurchase(db, {
    source: 'amazon',
    sourceOrderId: checksum,
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents: 4128,
    checksum,
  });
}

function runner(overrides: Partial<Parameters<typeof createSweepRunner>[0]> = {}) {
  return createSweepRunner({
    db,
    finance,
    defaultWindowDays: 21,
    coalesceMs: 1000,
    pollMs: 10_000,
    nightlyMs: 100_000,
    ...overrides,
  });
}

describe('coalescing', () => {
  it('collapses a burst of ingests into a single sweep', async () => {
    // The behaviour this file exists for. A backfill posts hundreds of
    // orders in about a second; one sweep per ingest would re-solve the
    // same window hundreds of times and ask finance for it every time.
    order('a');
    const sweeper = runner();

    for (let i = 0; i < 500; i++) sweeper.request();
    await vi.advanceTimersByTimeAsync(1000);
    await sweeper.drain();

    expect(fetches).toBe(1);
    sweeper.stop();
  });

  it('does not sweep before the coalescing window closes', async () => {
    order('a');
    const sweeper = runner();

    sweeper.request();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetches).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    await sweeper.drain();
    expect(fetches).toBe(1);
    sweeper.stop();
  });

  it('opens a fresh window after the previous one ran', async () => {
    order('a');
    const sweeper = runner();

    sweeper.request();
    await vi.advanceTimersByTimeAsync(1000);
    await sweeper.drain();

    sweeper.request();
    await vi.advanceTimersByTimeAsync(1000);
    await sweeper.drain();

    expect(fetches).toBe(2);
    sweeper.stop();
  });

  it('sweeps once more for a request that arrived mid-run', async () => {
    // Otherwise the last order of a burst — the one that arrived while the
    // sweep was already reading — is never reconciled until the next timer.
    order('a');
    let resolveFetch: ((value: CandidateFetch) => void) | undefined;
    const gate = new Promise<CandidateFetch>((resolve) => {
      resolveFetch = resolve;
    });
    const slowFinance: FinanceClient = {
      fetchCandidates: () => {
        fetches += 1;
        // Only the first call blocks; later ones return immediately.
        return fetches === 1 ? gate : Promise.resolve({ kind: 'ok', transactions: [] });
      },
    };
    const sweeper = runner({ finance: slowFinance });

    const first = sweeper.runOnce();
    // Arrives while the first is still waiting on finance.
    void sweeper.runOnce().catch(() => undefined);
    expect(fetches).toBe(1);

    resolveFetch?.({ kind: 'ok', transactions: [] });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    await sweeper.drain();

    expect(fetches).toBe(2);
    sweeper.stop();
  });
});

describe('the timed triggers', () => {
  it('sweeps on the poll interval', async () => {
    order('a');
    const sweeper = runner();
    sweeper.start();

    await vi.advanceTimersByTimeAsync(10_000);
    await sweeper.drain();
    expect(fetches).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await sweeper.drain();
    expect(fetches).toBe(2);

    sweeper.stop();
  });

  it('keeps sweeping after a failure rather than dying', async () => {
    // A worker that stops on the first transient error is worse than no
    // worker: reconciliation silently ends and nothing says so.
    order('a');
    let calls = 0;
    const flaky: FinanceClient = {
      fetchCandidates: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('boom'));
        return Promise.resolve<CandidateFetch>({ kind: 'ok', transactions: [] });
      },
    };
    const warn = vi.fn();
    const sweeper = runner({ finance: flaky, logger: { warn } });
    sweeper.start();

    await vi.advanceTimersByTimeAsync(10_000);
    await sweeper.drain();
    await vi.advanceTimersByTimeAsync(10_000);
    await sweeper.drain();

    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalled();
    sweeper.stop();
  });

  it('sweeps on the nightly interval as well as the poll', async () => {
    // The backstop trigger: whatever the poll missed while the process was
    // down still gets swept once a day.
    order('a');
    const sweeper = runner({ pollMs: 1_000_000 });
    sweeper.start();

    await vi.advanceTimersByTimeAsync(100_000);
    await sweeper.drain();
    expect(fetches).toBe(1);

    await vi.advanceTimersByTimeAsync(100_000);
    await sweeper.drain();
    expect(fetches).toBe(2);

    sweeper.stop();
  });

  it('stops cleanly', async () => {
    order('a');
    const sweeper = runner();
    sweeper.start();
    sweeper.stop();

    await vi.advanceTimersByTimeAsync(100_000);
    await sweeper.drain();
    expect(fetches).toBe(0);
  });

  it('ignores a request after stopping', async () => {
    order('a');
    const sweeper = runner();
    sweeper.stop();
    sweeper.request();

    await vi.advanceTimersByTimeAsync(10_000);
    await sweeper.drain();
    expect(fetches).toBe(0);
  });
});

describe('reporting', () => {
  it('logs a skipped sweep distinctly from a completed one', async () => {
    order('a');
    const info = vi.fn();
    const down: FinanceClient = {
      fetchCandidates: () =>
        Promise.resolve<CandidateFetch>({ kind: 'unavailable', reason: 'unavailable' }),
    };
    const sweeper = runner({ finance: down, logger: { info } });

    await sweeper.runOnce();

    expect(info).toHaveBeenCalledWith('purchases sweep skipped', { reason: 'unavailable' });
    sweeper.stop();
  });

  it('reports what a completed sweep did', async () => {
    order('a');
    const info = vi.fn();
    const sweeper = runner({ logger: { info } });

    await sweeper.runOnce();

    expect(info).toHaveBeenCalledWith(
      'purchases sweep complete',
      expect.objectContaining({ derivedChargesMinted: 1 })
    );
    sweeper.stop();
  });
});
