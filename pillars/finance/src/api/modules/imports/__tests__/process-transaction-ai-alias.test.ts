/**
 * Regression test for CF024 (#3630): `resolveAiResult` only checked
 * `context.entityLookup`, never `context.aliases` — the same alias map the
 * deterministic matcher already has in scope. When Claude replies with a
 * string that matches a stored alias rather than the entity's canonical
 * name (a plausible outcome since the model never sees which spelling is
 * canonical), the row must still resolve to `matched` instead of being
 * bucketed `uncertain`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { processTransactionSafely } from '../process-transaction.js';
import { createAiCounters } from '../types.js';

import type { ParsedTransaction, ProcessContext } from '../types.js';

const categorizeWithAi = vi.fn();

vi.mock('../ai-categorizer.js', () => ({
  categorizeWithAi: (...args: unknown[]) => categorizeWithAi(...args),
  isAiCategorizerEnabled: () => true,
  toCategorizerInput: (t: ParsedTransaction) => ({ description: t.description }),
}));

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function makeTransaction(description: string): ParsedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -42,
    dialectAccountLabel: 'amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
  };
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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-process-transaction-ai-alias-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('resolveAiResult — falls back to the alias map (CF024)', () => {
  it('matches when the AI reply is a known alias rather than the canonical entity name', async () => {
    categorizeWithAi.mockResolvedValue({
      result: { entityName: 'Woolies', tags: ['Groceries'] },
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.0001 },
    });
    const context = makeContext({
      entityLookup: new Map([['woolworths', { id: 'ww-id', name: 'Woolworths' }]]),
      aliases: new Map([['woolies', 'Woolworths']]),
    });
    const counters = createAiCounters();

    const result = await processTransactionSafely({
      db,
      transaction: makeTransaction('WW ONLINE PYMT REF9928'),
      context,
      counters,
    });

    expect(result.matched?.status).toBe('matched');
    expect(result.matched?.entity).toMatchObject({
      entityId: 'ww-id',
      entityName: 'Woolworths',
      matchType: 'ai',
    });
    expect(result.uncertain).toBeUndefined();
  });

  it('still buckets uncertain when the AI name matches neither the canonical name nor an alias', async () => {
    categorizeWithAi.mockResolvedValue({
      result: { entityName: 'Some Unknown Merchant', tags: [] },
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.0001 },
    });
    const context = makeContext({
      entityLookup: new Map([['woolworths', { id: 'ww-id', name: 'Woolworths' }]]),
      aliases: new Map([['woolies', 'Woolworths']]),
    });
    const counters = createAiCounters();

    const result = await processTransactionSafely({
      db,
      transaction: makeTransaction('UNKNOWN MERCHANT XYZ'),
      context,
      counters,
    });

    expect(result.uncertain?.status).toBe('uncertain');
    expect(result.uncertain?.entity).toMatchObject({
      entityName: 'Some Unknown Merchant',
      matchType: 'ai',
    });
    expect(result.matched).toBeUndefined();
  });
});
