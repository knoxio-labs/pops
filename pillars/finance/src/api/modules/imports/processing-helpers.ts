/**
 * Per-batch state helpers — bucket scaffolding, AI usage rollup, warnings.
 *
 * Ported from the monolith `lib/processing-helpers.ts`. The AI warning shape is
 * preserved on the wire (`ImportWarning`): a disabled categorizer that ≥1 row
 * reached surfaces as `AI_CATEGORIZATION_UNAVAILABLE`, failed AI calls as
 * `AI_API_ERROR`.
 */
import type { AiCounters, AiUsageStats, ImportWarning, ProcessedTransaction } from './types.js';

export interface ProgressBatchItem {
  description: string;
  status: 'processing' | 'success' | 'failed';
  error?: string;
}

/**
 * Rows settled between progress emissions.
 *
 * Each emission costs one event-loop turn, so per-row would trade the whole
 * run's throughput for resolution nobody can see; at this size a 3231-row
 * import yields ~130 times, which is imperceptible against the classification
 * itself but frequent enough that the bar visibly moves.
 */
export const PROGRESS_INTERVAL_ROWS = 25;

/**
 * Hand the event loop back so pending HTTP work runs.
 *
 * The pillar is a single Node process, so a run that never yields starves the
 * very `/imports/progress` polls meant to observe it — writing to the progress
 * store more often changes nothing on its own, because no poll can be answered
 * until the loop ends. `setImmediate` yields the macrotask queue, where those
 * requests sit.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function appendBatchItem(currentBatch: ProgressBatchItem[], item: ProgressBatchItem): void {
  currentBatch.push(item);
  if (currentBatch.length > 5) currentBatch.shift();
}

export function buildAiUsage(counters: AiCounters): AiUsageStats | undefined {
  const { aiApiCalls, aiCacheHits, totalInputTokens, totalOutputTokens, totalCostUsd } = counters;
  if (aiApiCalls === 0 && aiCacheHits === 0) return undefined;
  return {
    apiCalls: aiApiCalls,
    cacheHits: aiCacheHits,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    avgCostPerCall: aiApiCalls > 0 ? totalCostUsd / aiApiCalls : 0,
  };
}

export function buildAiWarnings(counters: AiCounters): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  if (counters.aiDisabled && counters.aiDisabledCount > 0) {
    warnings.push({
      type: 'AI_CATEGORIZATION_UNAVAILABLE',
      message:
        'AI categorization is disabled on this server — unmatched transactions were not sent to AI',
      affectedCount: counters.aiDisabledCount,
      details: 'FINANCE_AI_CATEGORIZER_ENABLED != true',
    });
  }
  if (counters.aiError && counters.aiFailureCount > 0) {
    warnings.push({
      type: 'AI_API_ERROR',
      message: 'AI categorization unavailable',
      affectedCount: counters.aiFailureCount,
    });
  }
  return warnings;
}

export interface ProcessBuckets {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
}

export function makeBuckets(): ProcessBuckets {
  return { matched: [], uncertain: [], failed: [], skipped: [] };
}
