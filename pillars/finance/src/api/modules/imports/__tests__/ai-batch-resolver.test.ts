/**
 * Unit tests for the batched AI resolver (CP025 + CP026 / #3656 / CF039):
 * chunking pending rows into batch-size groups, finalizing a batch reply back
 * into matched/uncertain rows, and the shared circuit breaker short-circuiting
 * after consecutive rate-limit failures instead of retrying every chunk.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { AiCategorizationError } from '../ai-categorizer-error.js';
import { AiCircuitBreaker } from '../ai-circuit-breaker.js';
import { createAiCounters } from '../types.js';

import type { PendingAiItem } from '../ai-batch-resolver.js';
import type { AiCallUsage } from '../ai-categorizer.js';
import type { TransactionProcessResult } from '../process-transaction.js';
import type { AiCounters, ParsedTransaction, ProcessContext } from '../types.js';

const categorizeBatchWithAi = vi.fn();

vi.mock('../ai-categorizer.js', async () => {
  const actual =
    await vi.importActual<typeof import('../ai-categorizer.js')>('../ai-categorizer.js');
  return {
    ...actual,
    categorizeBatchWithAi: (...args: unknown[]) => categorizeBatchWithAi(...args),
  };
});

const { resolvePendingAi } = await import('../ai-batch-resolver.js');

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function makeTransaction(description: string): ParsedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -20,
    dialectAccountLabel: 'amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
  };
}

function makePending(descriptions: string[]): PendingAiItem[] {
  return descriptions.map((description, index) => ({
    index,
    transaction: makeTransaction(description),
  }));
}

function makeContext(overrides: Partial<ProcessContext> = {}): ProcessContext {
  return {
    entityLookup: new Map(),
    aliases: new Map(),
    knownTags: [],
    importBatchId: 'batch-1',
    entityDefaultTags: new Map(),
    correctionRules: [],
    ...overrides,
  };
}

function usage(): AiCallUsage {
  return { inputTokens: 100, outputTokens: 20, costUsd: 0.0002 };
}

beforeEach(() => {
  categorizeBatchWithAi.mockReset();
  // The ai-categorizer mock spreads the actual module, so the real env-gated
  // isAiCategorizerEnabled runs — without this every test below would silently
  // take the disabled short-circuit.
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-batch-resolver-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  try {
    opened.raw.close();
  } catch {
    // already closed by the DB-failure test
  }
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'];
});

describe('resolvePendingAi — batching (CP025)', () => {
  it('sends one call for every pending row and finalizes matched entities', async () => {
    categorizeBatchWithAi.mockResolvedValue({
      results: [
        { entityName: 'Woolworths', tags: ['Groceries'], confidence: 0.9 },
        { entityName: 'Aldi', tags: ['Groceries'], confidence: 0.8 },
      ],
      usage: usage(),
    });

    const pending = makePending(['WOOLWORTHS 1234', 'ALDI 4823']);
    const context = makeContext({
      entityLookup: new Map([
        ['woolworths', { id: 'ww-id', name: 'Woolworths' }],
        ['aldi', { id: 'aldi-id', name: 'Aldi' }],
      ]),
    });
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 2 });

    await resolvePendingAi({ db, pending, context, counters, results });

    expect(categorizeBatchWithAi).toHaveBeenCalledTimes(1);
    expect(results[0]?.matched?.entity).toMatchObject({ entityId: 'ww-id', matchType: 'ai' });
    expect(results[1]?.matched?.entity).toMatchObject({ entityId: 'aldi-id', matchType: 'ai' });
    expect(counters.aiApiCalls).toBe(1);
    expect(counters.totalCostUsd).toBeCloseTo(0.0002, 9);
  });

  it('buckets a row uncertain when the AI names an entity outside entityLookup', async () => {
    categorizeBatchWithAi.mockResolvedValue({
      results: [{ entityName: 'Some Unknown Merchant', tags: [], confidence: 0.5 }],
      usage: usage(),
    });

    const pending = makePending(['UNKNOWN MERCHANT XYZ']);
    const context = makeContext();
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 1 });

    await resolvePendingAi({ db, pending, context, counters, results });

    expect(results[0]?.uncertain?.entity).toMatchObject({
      entityName: 'Some Unknown Merchant',
      matchType: 'ai',
    });
  });

  it('chunks pending rows into FINANCE_AI_CATEGORIZER_BATCH_SIZE-sized groups', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '2';
    categorizeBatchWithAi.mockImplementation((inputs: unknown[]) =>
      Promise.resolve({ results: inputs.map(() => null), usage: usage() })
    );

    const pending = makePending(['A', 'B', 'C', 'D', 'E']);
    const context = makeContext();
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 5 });

    await resolvePendingAi({ db, pending, context, counters, results });

    expect(categorizeBatchWithAi).toHaveBeenCalledTimes(3);
    const sizes = categorizeBatchWithAi.mock.calls.map((call) => (call[0] as unknown[]).length);
    expect(sizes).toEqual([2, 2, 1]);
    expect(counters.aiApiCalls).toBe(3);
  });

  it('is a no-op (no call) when there are no pending rows', async () => {
    const context = makeContext();
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = [];

    await resolvePendingAi({ db, pending: [], context, counters, results });

    expect(categorizeBatchWithAi).not.toHaveBeenCalled();
  });
});

describe('resolvePendingAi — circuit breaker (CP026)', () => {
  it('opens after threshold consecutive RATE_LIMITED chunks and stops calling the AI', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '1';
    categorizeBatchWithAi.mockRejectedValue(
      new AiCategorizationError('rate limited', 'RATE_LIMITED')
    );

    const pending = makePending(['A', 'B', 'C', 'D']);
    const context = makeContext();
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 4 });
    const breaker = new AiCircuitBreaker(2);

    await resolvePendingAi({ db, pending, context, counters, results, breaker });

    // Only the first 2 chunks actually call the AI; the breaker trips before
    // chunks 3 and 4, which are bucketed uncertain with no further call.
    expect(categorizeBatchWithAi).toHaveBeenCalledTimes(2);
    expect(breaker.isOpen).toBe(true);
    for (const result of results) {
      expect(result?.uncertain?.error).toBe('AI categorization unavailable');
    }
    expect(counters.aiFailureCount).toBe(4);
    expect(counters.aiError).toBe(true);
  });

  it('a non-rate-limit failure buckets that chunk uncertain but does not trip the breaker', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '1';
    categorizeBatchWithAi
      .mockRejectedValueOnce(new AiCategorizationError('bad json', 'PARSE_ERROR'))
      .mockResolvedValueOnce({ results: [{ entityName: 'Aldi', tags: [], confidence: 0.7 }] });

    const pending = makePending(['GARBLED', 'ALDI 4823']);
    const context = makeContext({
      entityLookup: new Map([['aldi', { id: 'aldi-id', name: 'Aldi' }]]),
    });
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 2 });
    const breaker = new AiCircuitBreaker(1);

    await resolvePendingAi({ db, pending, context, counters, results, breaker });

    expect(categorizeBatchWithAi).toHaveBeenCalledTimes(2);
    expect(breaker.isOpen).toBe(false);
    expect(results[0]?.uncertain?.error).toBe('AI categorization unavailable');
    expect(results[1]?.matched?.entity).toMatchObject({ entityId: 'aldi-id' });
  });

  it('a rate-limited chunk followed by a recovery keeps the breaker closed', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '1';
    categorizeBatchWithAi
      .mockRejectedValueOnce(new AiCategorizationError('rate limited', 'RATE_LIMITED'))
      .mockResolvedValueOnce({ results: [{ entityName: 'Aldi', tags: [], confidence: 0.7 }] })
      .mockRejectedValueOnce(new AiCategorizationError('rate limited', 'RATE_LIMITED'));

    const pending = makePending(['A', 'ALDI', 'B']);
    const context = makeContext({
      entityLookup: new Map([['aldi', { id: 'aldi-id', name: 'Aldi' }]]),
    });
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 3 });
    const breaker = new AiCircuitBreaker(2);

    await resolvePendingAi({ db, pending, context, counters, results, breaker });

    expect(categorizeBatchWithAi).toHaveBeenCalledTimes(3);
    expect(breaker.isOpen).toBe(false);
  });
});

describe('resolvePendingAi — categorizer disabled', () => {
  it('never calls the AI and buckets every pending row uncertain with the disabled reason', async () => {
    delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];

    const pending = makePending(['A', 'B', 'C']);
    const context = makeContext();
    const counters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 3 });

    await resolvePendingAi({ db, pending, context, counters, results });

    expect(categorizeBatchWithAi).not.toHaveBeenCalled();
    for (const result of results) {
      expect(result?.uncertain?.error).toBe('No entity match found (AI categorization disabled)');
      expect(result?.uncertain?.entity.matchType).toBe('none');
    }
    expect(counters.aiDisabled).toBe(true);
    expect(counters.aiDisabledCount).toBe(3);
    expect(counters.aiError).toBe(false);
    expect(counters.aiFailureCount).toBe(0);
    expect(counters.aiApiCalls).toBe(0);
    expect(counters.aiCacheHits).toBe(0);
    expect(counters.totalInputTokens).toBe(0);
    expect(counters.totalOutputTokens).toBe(0);
    expect(counters.totalCostUsd).toBe(0);
  });
});

describe('resolvePendingAi — per-row failure isolation', () => {
  it('degrades a row to failed on a DB error while finalizing, without crashing the rest', async () => {
    categorizeBatchWithAi.mockResolvedValue({
      results: [{ entityName: 'Aldi', tags: [], confidence: 0.7 }],
    });

    const pending = makePending(['ALDI 4823']);
    const context = makeContext({
      entityLookup: new Map([['aldi', { id: 'aldi-id', name: 'Aldi' }]]),
    });
    const counters: AiCounters = createAiCounters();
    const results: (TransactionProcessResult | undefined)[] = Array.from({ length: 1 });

    opened.raw.close();

    await resolvePendingAi({ db, pending, context, counters, results });

    expect(results[0]?.batchStatus).toBe('failed');
    expect(results[0]?.failed).toBeDefined();
  });
});
