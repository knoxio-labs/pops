/**
 * Regression test for CF012 (#3618): `counters.aiFailureCount` must actually
 * increment on each `AiCategorizationError`, otherwise `buildAiWarnings`
 * always returns `[]` and the wizard's AI-outage warning/manual-continue gate
 * is unreachable.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { AiCategorizationError } from '../ai-categorizer-error.js';
import { processTransactionSafely } from '../process-transaction.js';
import { buildAiWarnings } from '../processing-helpers.js';
import { createAiCounters } from '../types.js';

import type { ParsedTransaction, ProcessContext } from '../types.js';

const { categorizeWithAi, isAiCategorizerEnabled } = vi.hoisted(() => ({
  categorizeWithAi: vi.fn(),
  isAiCategorizerEnabled: vi.fn(),
}));

vi.mock('../ai-categorizer.js', () => ({
  categorizeWithAi,
  isAiCategorizerEnabled,
  toCategorizerInput: (t: ParsedTransaction) => ({ description: t.description }),
}));

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function makeTransaction(description: string): ParsedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: 12.5,
    account: 'amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
  };
}

function makeContext(): ProcessContext {
  return {
    entityLookup: new Map(),
    aliases: new Map(),
    knownTags: [],
    importBatchId: 'batch-1',
    entityDefaultTags: new Map(),
    correctionRules: [],
  };
}

beforeEach(() => {
  isAiCategorizerEnabled.mockReturnValue(true);
  categorizeWithAi.mockRejectedValue(new AiCategorizationError('boom', 'API_ERROR'));
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-process-transaction-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('processTransactionSafely — aiFailureCount (CF012)', () => {
  it('increments aiFailureCount on each AI categorization failure', async () => {
    const counters = createAiCounters();
    const context = makeContext();

    const result = await processTransactionSafely({
      db,
      transaction: makeTransaction('UNKNOWN MERCHANT ONE'),
      context,
      counters,
    });

    expect(result.uncertain?.error).toBe('AI categorization unavailable');
    expect(counters.aiError).toBe(true);
    expect(counters.aiFailureCount).toBe(1);
  });

  it('produces a warnings entry with affectedCount matching N consecutive AI failures', async () => {
    const counters = createAiCounters();
    const context = makeContext();
    const N = 3;

    for (let i = 0; i < N; i++) {
      await processTransactionSafely({
        db,
        transaction: makeTransaction(`UNKNOWN MERCHANT ${i}`),
        context,
        counters,
      });
    }

    expect(counters.aiFailureCount).toBe(N);

    const warnings = buildAiWarnings(counters);
    expect(warnings).toEqual([
      {
        type: 'AI_API_ERROR',
        message: 'AI categorization unavailable',
        affectedCount: N,
      },
    ]);
  });
});

describe('processTransactionSafely — categorizer disabled', () => {
  it('buckets each row uncertain with the disabled reason and never calls the AI', async () => {
    isAiCategorizerEnabled.mockReturnValue(false);
    const counters = createAiCounters();
    const context = makeContext();

    const first = await processTransactionSafely({
      db,
      transaction: makeTransaction('UNKNOWN MERCHANT ONE'),
      context,
      counters,
    });
    const second = await processTransactionSafely({
      db,
      transaction: makeTransaction('UNKNOWN MERCHANT TWO'),
      context,
      counters,
    });

    expect(categorizeWithAi).not.toHaveBeenCalled();
    expect(first.uncertain?.error).toBe('No entity match found (AI categorization disabled)');
    expect(second.uncertain?.error).toBe('No entity match found (AI categorization disabled)');
    expect(counters.aiDisabled).toBe(true);
    expect(counters.aiDisabledCount).toBe(2);
    expect(counters.aiError).toBe(false);
    expect(counters.aiFailureCount).toBe(0);
  });
});
