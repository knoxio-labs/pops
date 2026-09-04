/**
 * Regression tests for import progress reporting.
 *
 * Observed on a real ~500-row import: the client sat at `0/500` for the whole
 * run and then jumped straight to the result.
 *
 * The subtlety these tests exist to preserve: the broken version DID call
 * `onProgress` once per row with an advancing count. Asserting on the sequence
 * of callback arguments therefore proves nothing — it passes on the bug. The
 * defect was that every one of those calls happened inside a single
 * synchronous tick, so the `/imports/progress` polls meant to observe them
 * could not be served until the run had already finished.
 *
 * So each test here observes progress the way the frontend does: from a
 * concurrent timer, sampling the latest value while the import runs. A count
 * that is written but never observable is exactly the bug.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { processImportCore } from '../process-service.js';

import type { ParsedTransaction } from '../types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-progress-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function batch(size: number): ParsedTransaction[] {
  return Array.from({ length: size }, (_unused, i) => ({
    date: '2026-01-01',
    description: `MERCHANT ${i}`,
    amount: -20,
    account: 'ANZ Credit Card',
    rawRow: `row-${i}`,
    checksum: `sum-${i}`,
  }));
}

interface ProgressObservation {
  /** Counts a concurrent poller actually saw while the import was running. */
  sampled: number[];
  /** Every count written, observable or not. */
  emitted: number[];
}

/**
 * Run an import while an observer re-schedules itself through the event loop,
 * sampling the latest progress each time it gets to run.
 *
 * `setImmediate` rather than a wall-clock timer deliberately: the question is
 * whether the classification loop ever hands control back, and a self-
 * rescheduling immediate answers that deterministically instead of depending on
 * how many milliseconds the machine took. A run that never yields lets the
 * observer run exactly zero times before the import resolves — which is the
 * frontend's experience of a poll that cannot be served.
 */
async function observeProgress(transactions: ParsedTransaction[]): Promise<ProgressObservation> {
  const emitted: number[] = [];
  const sampled: number[] = [];
  let latest = 0;
  let observing = true;

  const observe = () => {
    if (!observing) return;
    sampled.push(latest);
    setImmediate(observe);
  };
  setImmediate(observe);

  try {
    await processImportCore({
      db,
      contacts: makeContactsFake(),
      transactions,
      importBatchId: 'batch-1',
      onProgress: (update) => {
        if (update.processedCount === undefined) return;
        emitted.push(update.processedCount);
        latest = update.processedCount;
      },
    });
  } finally {
    observing = false;
  }
  return { sampled, emitted };
}

const SIZE = 400;

describe('processImportCore — progress is observable while the run is in flight', () => {
  it('lets a concurrent observer see the count advance mid-run', async () => {
    const { sampled } = await observeProgress(batch(SIZE));
    const intermediate = sampled.filter((c) => c > 0 && c < SIZE);
    expect(intermediate.length).toBeGreaterThan(0);
  });

  it('lets an observer see several distinct counts, not one jump to the total', async () => {
    const { sampled } = await observeProgress(batch(SIZE));
    const distinct = new Set(sampled.filter((c) => c > 0 && c < SIZE));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });

  it('runs the observer at all during classification', async () => {
    // The blunt version of the same property: a fully synchronous run starves
    // the observer entirely, so it never runs before the import returns.
    const { sampled } = await observeProgress(batch(SIZE));
    expect(sampled.length).toBeGreaterThan(0);
  });
});

describe('processImportCore — the reported sequence', () => {
  it('never walks the count backwards', async () => {
    // The bookkeeping loop after classification used to re-send processedCount
    // from 1..N, replaying the whole run behind an already-full bar.
    const { emitted } = await observeProgress(batch(SIZE));
    const afterReset = emitted.slice(1);
    for (let i = 1; i < afterReset.length; i++) {
      expect(afterReset[i]).toBeGreaterThanOrEqual(afterReset[i - 1]!);
    }
  });

  it('finishes on the full count', async () => {
    const { emitted } = await observeProgress(batch(SIZE));
    expect(emitted.at(-1)).toBe(SIZE);
  });

  it('still reaches the total for a batch smaller than one progress interval', async () => {
    // Fewer rows than PROGRESS_INTERVAL_ROWS emits no interval update, so the
    // explicit total after classification is the only thing filling the bar.
    const { emitted } = await observeProgress(batch(10));
    expect(emitted.at(-1)).toBe(10);
  });

  it('reports nothing but zero for an empty batch', async () => {
    const { emitted } = await observeProgress([]);
    expect(emitted.every((c) => c === 0)).toBe(true);
  });
});
