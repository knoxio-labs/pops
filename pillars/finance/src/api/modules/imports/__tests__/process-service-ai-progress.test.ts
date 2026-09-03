/**
 * Regression tests for progress reporting through the batched AI pass.
 *
 * The deterministic ladder reports every 25 rows; the AI pass used to report
 * nothing at all, so on an import where most rows fall through to Claude the
 * count sat still for the longest, most network-bound part of the run and then
 * jumped to the total.
 *
 * These tests follow the technique in `process-service-progress.test.ts`: a
 * concurrent observer samples the latest count while the import is in flight,
 * because a count that is written but never observable is the same defect
 * wearing a different hat. Asserting on the callback arguments alone passes on
 * both.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';

import type { ParsedTransaction } from '../types.js';

const categorizeBatchWithAi = vi.fn();

vi.mock('../ai-categorizer.js', async () => {
  const actual =
    await vi.importActual<typeof import('../ai-categorizer.js')>('../ai-categorizer.js');
  return {
    ...actual,
    categorizeBatchWithAi: (...args: unknown[]) => categorizeBatchWithAi(...args),
  };
});

const { processImportCore } = await import('../process-service.js');

const BATCH_SIZE = 25;
const SIZE = 400;

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  categorizeBatchWithAi.mockReset();
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = String(BATCH_SIZE);
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-progress-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'];
  vi.restoreAllMocks();
});

/** No entity in the contacts fake matches these, so every row falls through to the AI pass. */
function batch(size: number): ParsedTransaction[] {
  return Array.from({ length: size }, (_unused, i) => ({
    date: '2026-01-01',
    description: `UNKNOWN MERCHANT ${i}`,
    amount: -20,
    account: 'ANZ Credit Card',
    rawRow: `row-${i}`,
    checksum: `sum-${i}`,
  }));
}

interface AiProgressObservation {
  /** Counts a concurrent poller actually saw while the import was running. */
  sampled: number[];
  /** Every count written, observable or not. */
  emitted: number[];
  /** Steps written, in order, deduplicated. */
  steps: string[];
  /** The latest count at the moment the first AI batch was dispatched. */
  countWhenAiStarted: number;
  /** Counts written after the AI phase began, excluding the final total. */
  emittedDuringAi: number[];
  /** The latest count seen by the observer at each AI batch dispatch. */
  sampledAtDispatch: number[];
}

/**
 * Answer each batch on a real macrotask, so the resolver behaves like a
 * network-bound call rather than an already-settled promise.
 */
function answerBatchesAfterATurn(onDispatch: () => void): void {
  categorizeBatchWithAi.mockImplementation(async (inputs: unknown) => {
    onDispatch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const items = inputs as unknown[];
    return {
      results: items.map(() => ({ entityName: 'Unknown Co', tags: [], confidence: 0.5 })),
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.0001 },
    };
  });
}

async function observeAiProgress(
  transactions: ParsedTransaction[]
): Promise<AiProgressObservation> {
  const emitted: number[] = [];
  const sampled: number[] = [];
  const steps: string[] = [];
  const sampledAtDispatch: number[] = [];
  const emittedDuringAi: number[] = [];
  let aiStarted = false;
  let latest = 0;
  let observed = 0;
  let countWhenAiStarted = -1;
  let observing = true;

  const observe = () => {
    if (!observing) return;
    observed = latest;
    sampled.push(latest);
    setImmediate(observe);
  };
  setImmediate(observe);

  answerBatchesAfterATurn(() => {
    if (countWhenAiStarted === -1) countWhenAiStarted = latest;
    aiStarted = true;
    sampledAtDispatch.push(observed);
  });

  try {
    await processImportCore({
      db,
      contacts: makeContactsFake(),
      transactions,
      importBatchId: 'batch-ai',
      onProgress: (update) => {
        if (update.currentStep && steps.at(-1) !== update.currentStep)
          steps.push(update.currentStep);
        if (update.processedCount === undefined) return;
        emitted.push(update.processedCount);
        if (aiStarted && update.processedCount < transactions.length) {
          emittedDuringAi.push(update.processedCount);
        }
        latest = update.processedCount;
      },
    });
  } finally {
    observing = false;
  }
  return { sampled, emitted, steps, countWhenAiStarted, sampledAtDispatch, emittedDuringAi };
}

describe('processImportCore — progress through the AI pass', () => {
  it('lets a concurrent observer watch the count advance while batches resolve', async () => {
    const { sampledAtDispatch } = await observeAiProgress(batch(SIZE));

    // The batch count each dispatch saw: a pass that reports nothing leaves
    // every dispatch looking at the same number.
    const distinct = new Set(sampledAtDispatch);
    expect(sampledAtDispatch.length).toBe(SIZE / BATCH_SIZE);
    expect(distinct.size).toBeGreaterThanOrEqual(SIZE / BATCH_SIZE - 1);
  });

  it('advances roughly one batch at a time rather than in one jump at the end', async () => {
    // Counted from the first dispatch onwards: emissions from the ladder pass
    // say nothing about whether the AI phase reports, and a test that counts
    // them passes while the AI phase stays mute.
    const { emittedDuringAi } = await observeAiProgress(batch(SIZE));

    expect(new Set(emittedDuringAi).size).toBeGreaterThanOrEqual(SIZE / BATCH_SIZE - 1);
  });

  it('does not count rows deferred to the AI pass as already done', async () => {
    // Every row here falls through the ladder, so nothing is settled until the
    // AI phase starts. Counting walked rows instead of settled ones filled the
    // bar before the longest part of the run had begun.
    const { countWhenAiStarted } = await observeAiProgress(batch(SIZE));

    expect(countWhenAiStarted).toBe(0);
  });

  it('never walks the count backwards across the pass boundary', async () => {
    const { emitted } = await observeAiProgress(batch(SIZE));

    for (let i = 1; i < emitted.length; i++) {
      expect(emitted[i]).toBeGreaterThanOrEqual(emitted[i - 1]!);
    }
  });

  it('finishes on the full count', async () => {
    const { emitted } = await observeAiProgress(batch(SIZE));

    expect(emitted.at(-1)).toBe(SIZE);
  });

  it('names the AI phase as its own step so a stall there is legible', async () => {
    const { steps } = await observeAiProgress(batch(SIZE));

    expect(steps).toEqual(['deduplicating', 'matching', 'categorizing']);
  });
});
