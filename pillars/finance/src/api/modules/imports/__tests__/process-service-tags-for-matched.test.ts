/**
 * Integration coverage for the tag-only pass through the real import core
 * (POPS-2596).
 *
 * The unit tests own the predicate; what only this tier can show is that the
 * pass is wired in at all, that it sees rows the deterministic ladder settled
 * (which never reach the AI resolver), and that the flag being off leaves the
 * run byte-identical to one from before the pass existed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';

import type { TagsOnlyInput } from '../ai-categorizer.js';
import type { ParsedTransaction } from '../types.js';

const categorizeBatchWithAi = vi.fn();
const tagsOnlyBatchWithAi = vi.fn();

vi.mock('../ai-categorizer.js', async () => {
  const actual =
    await vi.importActual<typeof import('../ai-categorizer.js')>('../ai-categorizer.js');
  return {
    ...actual,
    categorizeBatchWithAi: (...args: unknown[]) => categorizeBatchWithAi(...args),
    tagsOnlyBatchWithAi: (...args: unknown[]) => tagsOnlyBatchWithAi(...args),
  };
});

const { processImportCore } = await import('../process-service.js');

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

/** Woolworths is a seeded contact with no `defaultTags`, and no tag rule exists — the ticket's case. */
const CONTACTS = makeContactsFake({ seed: [{ name: 'Woolworths' }] });

function rows(count: number): ParsedTransaction[] {
  return Array.from({ length: count }, (_unused, i) => ({
    date: '2026-01-01',
    description: `WOOLWORTHS ${2000 + i}`,
    amount: -20 - i,
    dialectAccountLabel: 'ANZ Credit Card',
    rawRow: `row-${i}`,
    checksum: `sum-${i}`,
  }));
}

async function run(transactions: ParsedTransaction[]) {
  return processImportCore({
    db,
    contacts: CONTACTS,
    transactions,
    importBatchId: 'batch-1',
  });
}

beforeEach(() => {
  categorizeBatchWithAi.mockReset();
  tagsOnlyBatchWithAi.mockReset();
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-tags-for-matched-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'];
});

describe('tag-only pass through processImportCore', () => {
  it('leaves a matched merchant untagged and uncalled with the flag off', async () => {
    const { output } = await run(rows(3));

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
    expect(output.matched).toHaveLength(3);
    expect(output.matched[0]?.suggestedTags).toEqual([]);
    expect(output.aiUsage).toBeUndefined();
  });

  it('tags the same rows from one call with the flag on', async () => {
    process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'] = 'true';
    tagsOnlyBatchWithAi.mockResolvedValue({
      results: [{ tags: ['venue:supermarket', 'contains:groceries'] }],
      usage: { inputTokens: 120, outputTokens: 24, costUsd: 0.00024 },
    });

    const { output } = await run(rows(3));

    // Three rows, one descriptor once digits are stripped, one entry.
    expect(tagsOnlyBatchWithAi).toHaveBeenCalledTimes(1);
    expect(tagsOnlyBatchWithAi.mock.calls[0]?.[0] as TagsOnlyInput[]).toHaveLength(1);
    for (const row of output.matched) {
      expect(row.suggestedTags).toEqual([
        { tag: 'venue:supermarket', source: 'ai' },
        { tag: 'contains:groceries', source: 'ai' },
      ]);
    }
    expect(output.aiUsage?.apiCalls).toBe(1);
  });

  it('never sends a matched row to the entity categorizer', async () => {
    process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'] = 'true';
    tagsOnlyBatchWithAi.mockResolvedValue({ results: [{ tags: ['venue:supermarket'] }] });

    await run(rows(2));

    expect(categorizeBatchWithAi).not.toHaveBeenCalled();
  });
});
