import { AiCategorizationError } from './ai-categorizer-error.js';
/**
 * Batched AI resolution for the import pipeline (CP025 + CP026 / #3656 /
 * CF039). Rows that fall through the deterministic ladder
 * (`classifyWithoutAi`) collect into `pending`; this resolver chunks them into
 * `getCategorizerBatchSize()`-sized groups and sends ONE `categorizeBatchWithAi`
 * call per chunk instead of one `categorizeWithAi` round-trip per row.
 *
 * A single `AiCircuitBreaker` is shared across every chunk of one import run:
 * once a chunk's call comes back `RATE_LIMITED`, the breaker counts it, and
 * once `threshold` such chunks happen in a row the breaker opens — every
 * remaining pending row is bucketed uncertain (`'AI categorization
 * unavailable'`) WITHOUT another network call, instead of each subsequent
 * chunk paying its own 5-retry backoff ladder against a provider that's
 * already rate-limiting us.
 */
import {
  categorizeBatchWithAi,
  getCategorizerBatchSize,
  toCategorizerInput,
} from './ai-categorizer.js';
import { AiCircuitBreaker } from './ai-circuit-breaker.js';
import { buildKnownEntityHint } from './entity-vocabulary.js';
import { buildFailure } from './process-transaction-helpers.js';
import { finalizeAiResult } from './process-transaction.js';

import type { FinanceDb } from '../../../db/index.js';
import type { AiCacheEntry } from './ai-categorizer.js';
import type { ProcessTransactionArgs, TransactionProcessResult } from './process-transaction.js';
import type { AiCounters, ParsedTransaction, ProcessContext } from './types.js';

export interface PendingAiItem {
  index: number;
  transaction: ParsedTransaction;
}

export interface ResolvePendingAiArgs {
  db: FinanceDb;
  pending: PendingAiItem[];
  context: ProcessContext;
  counters: AiCounters;
  /** Indexed by the row's position in the caller's transaction list; filled in place. */
  results: (TransactionProcessResult | undefined)[];
  /** Injectable for tests; defaults to a fresh breaker for this run. */
  breaker?: AiCircuitBreaker;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** `finalizeAiResult`, but a DB failure inside it degrades the row to `failed` instead of crashing the whole chunk. */
function finalizeAiResultSafely(
  rowArgs: ProcessTransactionArgs,
  aiEntry: AiCacheEntry | null
): TransactionProcessResult {
  try {
    return finalizeAiResult(rowArgs, aiEntry);
  } catch (error) {
    const { failed, errorEntry } = buildFailure(rowArgs.transaction, error);
    return { failed, batchStatus: 'failed', errorEntry };
  }
}

function bucketUnavailable(env: ResolvePendingAiArgs, items: PendingAiItem[]): void {
  const { db, context, counters, results } = env;
  for (const item of items) {
    counters.aiError = true;
    counters.aiFailureCount++;
    results[item.index] = finalizeAiResultSafely(
      { db, transaction: item.transaction, context, counters },
      null
    );
  }
}

export async function resolvePendingAi(args: ResolvePendingAiArgs): Promise<void> {
  const { db, pending, context, counters, results } = args;
  if (pending.length === 0) return;

  const breaker = args.breaker ?? new AiCircuitBreaker();
  const knownEntityNames = buildKnownEntityHint(context.entityLookup);

  for (const items of chunk(pending, getCategorizerBatchSize())) {
    if (breaker.isOpen) {
      bucketUnavailable(args, items);
      continue;
    }

    try {
      const { results: batchResults, usage } = await categorizeBatchWithAi(
        items.map((item) => toCategorizerInput(item.transaction)),
        context.importBatchId,
        context.knownTags,
        knownEntityNames
      );
      breaker.recordRecovery();
      if (usage) {
        counters.aiApiCalls++;
        counters.totalInputTokens += usage.inputTokens;
        counters.totalOutputTokens += usage.outputTokens;
        counters.totalCostUsd += usage.costUsd;
      }
      items.forEach((item, i) => {
        results[item.index] = finalizeAiResultSafely(
          { db, transaction: item.transaction, context, counters },
          batchResults[i] ?? null
        );
      });
    } catch (error) {
      if (!(error instanceof AiCategorizationError)) throw error;
      if (error.code === 'RATE_LIMITED') breaker.recordRateLimited();
      bucketUnavailable(args, items);
    }
  }
}
