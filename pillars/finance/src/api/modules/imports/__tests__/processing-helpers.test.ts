/**
 * Unit tests for the per-batch state helpers (CF068/#3649): the sliding
 * progress window, the AI usage rollup, and the `buildAiWarnings` counter
 * math that gates the one AI-failure warning off both `aiError` and a
 * non-zero `aiFailureCount`.
 */
import { describe, expect, it } from 'vitest';

import {
  appendBatchItem,
  buildAiUsage,
  buildAiWarnings,
  makeBuckets,
  type ProgressBatchItem,
} from '../processing-helpers.js';

import type { AiCounters } from '../types.js';

function counters(overrides: Partial<AiCounters> = {}): AiCounters {
  return {
    aiError: false,
    aiFailureCount: 0,
    aiDisabled: false,
    aiDisabledCount: 0,
    aiApiCalls: 0,
    aiCacheHits: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

describe('appendBatchItem', () => {
  it('appends items up to the 5-item window', () => {
    const batch: ProgressBatchItem[] = [];
    for (let i = 0; i < 5; i++) {
      appendBatchItem(batch, { description: `item-${i}`, status: 'success' });
    }
    expect(batch.map((b) => b.description)).toEqual([
      'item-0',
      'item-1',
      'item-2',
      'item-3',
      'item-4',
    ]);
  });

  it('shifts out the oldest item once the window exceeds 5', () => {
    const batch: ProgressBatchItem[] = [];
    for (let i = 0; i < 6; i++) {
      appendBatchItem(batch, { description: `item-${i}`, status: 'success' });
    }
    expect(batch).toHaveLength(5);
    expect(batch.map((b) => b.description)).toEqual([
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
    ]);
  });
});

describe('buildAiUsage', () => {
  it('returns undefined when there were neither API calls nor cache hits', () => {
    expect(buildAiUsage(counters())).toBeUndefined();
  });

  it('computes avgCostPerCall from real API calls', () => {
    const usage = buildAiUsage(
      counters({ aiApiCalls: 4, totalInputTokens: 400, totalOutputTokens: 80, totalCostUsd: 0.08 })
    );
    expect(usage).toEqual({
      apiCalls: 4,
      cacheHits: 0,
      totalInputTokens: 400,
      totalOutputTokens: 80,
      totalCostUsd: 0.08,
      avgCostPerCall: 0.02,
    });
  });

  it('reports a zero avgCostPerCall when only cache hits occurred (no real calls to average over)', () => {
    const usage = buildAiUsage(counters({ aiCacheHits: 3 }));
    expect(usage?.avgCostPerCall).toBe(0);
    expect(usage?.cacheHits).toBe(3);
  });
});

describe('buildAiWarnings', () => {
  it('returns no warnings when aiError is false regardless of failure count', () => {
    expect(buildAiWarnings(counters({ aiError: false, aiFailureCount: 3 }))).toEqual([]);
  });

  it('returns no warnings when aiError is true but the failure count is zero', () => {
    expect(buildAiWarnings(counters({ aiError: true, aiFailureCount: 0 }))).toEqual([]);
  });

  it('emits one AI_API_ERROR warning carrying the failure count when both gates are true', () => {
    expect(buildAiWarnings(counters({ aiError: true, aiFailureCount: 7 }))).toEqual([
      { type: 'AI_API_ERROR', message: 'AI categorization unavailable', affectedCount: 7 },
    ]);
  });

  it('emits one AI_CATEGORIZATION_UNAVAILABLE warning with affectedCount and details when rows reached a disabled categorizer', () => {
    expect(buildAiWarnings(counters({ aiDisabled: true, aiDisabledCount: 4 }))).toEqual([
      {
        type: 'AI_CATEGORIZATION_UNAVAILABLE',
        message:
          'AI categorization is disabled on this server — unmatched transactions were not sent to AI',
        affectedCount: 4,
        details: 'FINANCE_AI_CATEGORIZER_ENABLED != true',
      },
    ]);
  });

  it('returns no warnings when aiDisabled is true but no row reached the AI stage', () => {
    expect(buildAiWarnings(counters({ aiDisabled: true, aiDisabledCount: 0 }))).toEqual([]);
  });

  it('emits both warnings, disabled first, when both counter pairs are set (defensive-order contract)', () => {
    const warnings = buildAiWarnings(
      counters({ aiDisabled: true, aiDisabledCount: 2, aiError: true, aiFailureCount: 3 })
    );
    expect(warnings.map((w) => w.type)).toEqual(['AI_CATEGORIZATION_UNAVAILABLE', 'AI_API_ERROR']);
    expect(warnings[0]?.affectedCount).toBe(2);
    expect(warnings[1]?.affectedCount).toBe(3);
  });
});

describe('makeBuckets', () => {
  it('creates four independent empty arrays', () => {
    const buckets = makeBuckets();
    expect(buckets).toEqual({ matched: [], uncertain: [], failed: [], skipped: [] });

    buckets.matched.push({} as never);
    expect(makeBuckets().matched).toHaveLength(0);
  });
});
