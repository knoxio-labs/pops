/**
 * Unit tests for the tag-only pass (POPS-2596).
 *
 * The trigger predicate is the expensive half of this feature: it runs over
 * every deterministically matched row of every import, so a predicate that is
 * one condition too loose bills the common path. These assert both directions
 * of each condition rather than only the case that fires.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { AiCategorizationError } from '../ai-categorizer-error.js';
import { AiCircuitBreaker } from '../ai-circuit-breaker.js';
import { createAiCounters } from '../types.js';

import type { TagsOnlyEntry, TagsOnlyInput } from '../ai-categorizer.js';
import type { TransactionProcessResult } from '../process-transaction.js';
import type {
  AiCounters,
  ProcessContext,
  ProcessedTransaction,
  SuggestedTag,
  TransactionType,
} from '../types.js';

const tagsOnlyBatchWithAi = vi.fn();

vi.mock('../ai-categorizer.js', async () => {
  const actual =
    await vi.importActual<typeof import('../ai-categorizer.js')>('../ai-categorizer.js');
  return {
    ...actual,
    tagsOnlyBatchWithAi: (...args: unknown[]) => tagsOnlyBatchWithAi(...args),
  };
});

const { resolveTagsForMatched } = await import('../ai-tags-resolver.js');

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;
let counters: AiCounters;

interface RowSpec {
  description: string;
  entityId?: string;
  entityName?: string;
  matchType?: ProcessedTransaction['entity']['matchType'];
  transactionType?: TransactionType;
  suggestedTags?: SuggestedTag[];
  bucket?: 'matched' | 'uncertain';
}

function makeRow(spec: RowSpec): TransactionProcessResult {
  const row: ProcessedTransaction = {
    date: '2026-01-01',
    description: spec.description,
    amount: -20,
    dialectAccountLabel: 'amex',
    rawRow: spec.description,
    checksum: crypto.randomUUID(),
    entity: {
      matchType: spec.matchType ?? 'contains',
      ...(spec.entityId === undefined ? {} : { entityId: spec.entityId }),
      ...(spec.entityName === undefined ? {} : { entityName: spec.entityName }),
    },
    status: spec.bucket === 'uncertain' ? 'uncertain' : 'matched',
    transactionType: spec.transactionType ?? 'purchase',
    suggestedTags: spec.suggestedTags ?? [],
  };
  return { [spec.bucket ?? 'matched']: row, batchStatus: 'success' } as TransactionProcessResult;
}

/** A tag-poor Woolworths row — the exact case the ticket exists for. */
function tagPoorRow(description = 'WOOLWORTHS 2246'): TransactionProcessResult {
  return makeRow({ description, entityId: 'woolies', entityName: 'Woolworths' });
}

function rowOf(result: TransactionProcessResult): ProcessedTransaction {
  const row = result.matched ?? result.uncertain;
  if (!row) throw new Error('result carried neither bucket');
  return row;
}

function makeContext(): ProcessContext {
  return {
    entityLookup: new Map(),
    aliases: new Map(),
    knownTags: ['venue:supermarket', 'contains:groceries'],
    importBatchId: 'batch-1',
    entityDefaultTags: new Map(),
    correctionRules: [],
  };
}

function reply(...entries: (TagsOnlyEntry | null)[]): {
  results: (TagsOnlyEntry | null)[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
} {
  return { results: entries, usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.0002 } };
}

function callInputs(call: number): TagsOnlyInput[] {
  return tagsOnlyBatchWithAi.mock.calls[call]?.[0] as TagsOnlyInput[];
}

async function resolve(
  results: TransactionProcessResult[],
  breaker?: AiCircuitBreaker
): Promise<void> {
  await resolveTagsForMatched({
    db,
    context: makeContext(),
    counters,
    results,
    ...(breaker ? { breaker } : {}),
  });
}

beforeEach(() => {
  tagsOnlyBatchWithAi.mockReset();
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'] = 'true';
  delete process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'];
  counters = createAiCounters();
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-tags-resolver-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'];
});

describe('trigger predicate', () => {
  it('classifies a matched merchant that came out with no tags', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(
      reply({ tags: ['venue:supermarket', 'contains:groceries'] })
    );
    const results = [tagPoorRow()];

    await resolve(results);

    expect(tagsOnlyBatchWithAi).toHaveBeenCalledTimes(1);
    expect(callInputs(0)).toEqual([
      {
        entityName: 'Woolworths',
        input: { description: 'WOOLWORTHS 2246', amount: -20, date: '2026-01-01' },
      },
    ]);
    expect(rowOf(results[0]!).suggestedTags).toEqual([
      { tag: 'venue:supermarket', source: 'ai' },
      { tag: 'contains:groceries', source: 'ai' },
    ]);
  });

  it('flags a returned value outside the active vocabulary as new', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: ['venue:speakeasy'] }));
    const results = [tagPoorRow()];

    await resolve(results);

    expect(rowOf(results[0]!).suggestedTags).toEqual([
      { tag: 'venue:speakeasy', source: 'ai', isNew: true },
    ]);
  });

  it('leaves a row that already carries rule tags alone', async () => {
    const results = [
      makeRow({
        description: 'WOOLWORTHS 2246',
        entityId: 'woolies',
        entityName: 'Woolworths',
        suggestedTags: [{ tag: 'contains:groceries', source: 'rule', pattern: 'WOOLWORTHS' }],
      }),
    ];

    await resolve(results);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
    expect(rowOf(results[0]!).suggestedTags).toEqual([
      { tag: 'contains:groceries', source: 'rule', pattern: 'WOOLWORTHS' },
    ]);
  });

  it('leaves a row the AI itself resolved alone — it already declined to tag it', async () => {
    const results = [
      makeRow({
        description: 'SQ *SOME BAR',
        entityId: 'bar',
        entityName: 'Some Bar',
        matchType: 'ai',
      }),
    ];

    await resolve(results);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
  });

  it('skips a row with no entity — the entity pass owns those', async () => {
    await resolve([makeRow({ description: 'INTEREST CHARGES', matchType: 'none' })]);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
  });

  it('skips a non-spend type, which the coverage measurement does not address', async () => {
    await resolve([
      makeRow({
        description: 'TRANSFER TO SAVINGS',
        entityId: 'bank',
        entityName: 'Up Bank',
        transactionType: 'transfer',
      }),
    ]);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
  });

  it('skips an entity-matched credit, which has no decided type yet', async () => {
    const results = [
      makeRow({
        description: 'WOOLWORTHS 2246',
        entityId: 'woolies',
        entityName: 'Woolworths',
        bucket: 'uncertain',
      }),
    ];
    // The credit path leaves `transactionType` unset on purpose.
    delete rowOf(results[0]!).transactionType;

    await resolve(results);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
  });

  it('classifies a refund against a matched merchant — a refund is spend', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: ['venue:supermarket'] }));

    await resolve([
      makeRow({
        description: 'WOOLWORTHS 2246',
        entityId: 'woolies',
        entityName: 'Woolworths',
        transactionType: 'refund',
      }),
    ]);

    expect(tagsOnlyBatchWithAi).toHaveBeenCalledTimes(1);
  });
});

describe('env gating', () => {
  it('makes no call when only the categorizer is enabled', async () => {
    delete process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'];
    const results = [tagPoorRow()];

    await resolve(results);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
    expect(rowOf(results[0]!).suggestedTags).toEqual([]);
    expect(counters).toEqual(createAiCounters());
  });

  it('makes no call when the categorizer itself is off', async () => {
    process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'false';

    await resolve([tagPoorRow()]);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
    expect(counters).toEqual(createAiCounters());
  });
});

describe('deduplication and chunking', () => {
  it('costs one batch entry per distinct normalized descriptor, not one per row', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(
      reply({ tags: ['venue:supermarket'] }, { tags: ['venue:cafe'] }, { tags: ['venue:bar'] })
    );
    const results = [
      ...Array.from({ length: 6 }, (_, i) => tagPoorRow(`WOOLWORTHS ${1000 + i}`)),
      ...Array.from({ length: 4 }, () =>
        makeRow({ description: 'CAFE X', entityId: 'cafe', entityName: 'Cafe X' })
      ),
      ...Array.from({ length: 2 }, () =>
        makeRow({ description: 'THE BAR', entityId: 'bar', entityName: 'The Bar' })
      ),
    ];

    await resolve(results);

    expect(tagsOnlyBatchWithAi).toHaveBeenCalledTimes(1);
    expect(callInputs(0)).toHaveLength(3);
    // The six Woolworths rows differ only in digits, which `normalizeDescription` strips.
    for (const result of results.slice(0, 6)) {
      expect(rowOf(result).suggestedTags).toEqual([{ tag: 'venue:supermarket', source: 'ai' }]);
    }
    expect(rowOf(results[6]!).suggestedTags).toEqual([{ tag: 'venue:cafe', source: 'ai' }]);
  });

  it('gives each row its own suggestion objects so the wizard can edit them apart', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: ['venue:supermarket'] }));
    const results = [tagPoorRow('WOOLWORTHS 1'), tagPoorRow('WOOLWORTHS 2')];

    await resolve(results);

    const [first, second] = results.map((r) => rowOf(r).suggestedTags?.[0]);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('keeps two entities apart even when their descriptors normalize the same', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: [] }, { tags: [] }));

    await resolve([
      makeRow({ description: 'PAYMENT 1', entityId: 'a', entityName: 'Alpha' }),
      makeRow({ description: 'PAYMENT 2', entityId: 'b', entityName: 'Beta' }),
    ]);

    expect(callInputs(0).map((i) => i.entityName)).toEqual(['Alpha', 'Beta']);
  });

  it('chunks distinct descriptors at the configured batch size', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '2';
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: [] }, { tags: [] }));

    await resolve([
      tagPoorRow('AAA'),
      tagPoorRow('BBB'),
      tagPoorRow('CCC'),
      tagPoorRow('DDD'),
      tagPoorRow('EEE'),
    ]);

    expect(tagsOnlyBatchWithAi.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([
      2, 2, 1,
    ]);
  });
});

describe('counters', () => {
  it('rolls usage into the run totals so this path is visible in the cost report', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: ['venue:supermarket'] }));

    await resolve([tagPoorRow()]);

    expect(counters.aiApiCalls).toBe(1);
    expect(counters.totalInputTokens).toBe(100);
    expect(counters.totalOutputTokens).toBe(20);
    expect(counters.totalCostUsd).toBeCloseTo(0.0002);
  });

  it('counts refused values without storing them', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(
      reply({ tags: ['venue:supermarket'], rejectedTagValues: 2 })
    );
    const results = [tagPoorRow()];

    await resolve(results);

    expect(counters.aiTagValuesRejected).toBe(2);
    expect(rowOf(results[0]!).suggestedTags).toEqual([{ tag: 'venue:supermarket', source: 'ai' }]);
  });

  it('leaves a row alone when the reply carries no usable tags', async () => {
    tagsOnlyBatchWithAi.mockResolvedValue(reply({ tags: [] }));
    const results = [tagPoorRow()];

    await resolve(results);

    expect(rowOf(results[0]!).suggestedTags).toEqual([]);
    expect(rowOf(results[0]!).status).toBe('matched');
  });
});

describe('degradation', () => {
  it('makes no call at all once the shared breaker is open', async () => {
    const breaker = new AiCircuitBreaker(1);
    breaker.recordRateLimited();
    const results = [tagPoorRow()];

    await resolve(results, breaker);

    expect(tagsOnlyBatchWithAi).not.toHaveBeenCalled();
    expect(rowOf(results[0]!).suggestedTags).toEqual([]);
    expect(rowOf(results[0]!).status).toBe('matched');
  });

  it('trips the breaker on a rate limit and stops after the threshold', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'] = '1';
    tagsOnlyBatchWithAi.mockRejectedValue(
      new AiCategorizationError('429 Too Many Requests', 'RATE_LIMITED')
    );
    const breaker = new AiCircuitBreaker(2);
    const results = [tagPoorRow('AAA'), tagPoorRow('BBB'), tagPoorRow('CCC'), tagPoorRow('DDD')];

    await resolve(results, breaker);

    expect(tagsOnlyBatchWithAi).toHaveBeenCalledTimes(2);
    expect(breaker.isOpen).toBe(true);
  });

  it('never re-buckets or fails a row on an API error', async () => {
    tagsOnlyBatchWithAi.mockRejectedValue(new AiCategorizationError('boom', 'API_ERROR'));
    const results = [tagPoorRow()];

    await resolve(results);

    expect(rowOf(results[0]!).status).toBe('matched');
    expect(rowOf(results[0]!).suggestedTags).toEqual([]);
    expect(results[0]?.failed).toBeUndefined();
    // No AI_API_ERROR warning: nothing was lost, the rows are where the ladder left them.
    expect(counters.aiError).toBe(false);
    expect(counters.aiFailureCount).toBe(0);
  });

  it('rethrows a non-categorizer error rather than swallowing a real bug', async () => {
    tagsOnlyBatchWithAi.mockRejectedValue(new TypeError('undefined is not a function'));

    await expect(resolve([tagPoorRow()])).rejects.toThrow(TypeError);
  });
});
