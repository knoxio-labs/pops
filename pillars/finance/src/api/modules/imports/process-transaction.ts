/**
 * Single-transaction classification: correction rules → transfer heuristic →
 * entity matcher → AI fallback → no-match.
 *
 * Ported from the monolith `lib/process-transaction.ts`, db-injected. The AI
 * stage calls `categorizeWithAi`; when the categorizer is disabled (the
 * default) it returns `{ result: null }` so the no-match reason is
 * `'No entity match found'` and the AI counters stay zero. An
 * `AiCategorizationError` (enabled but key/API failure) degrades to an
 * uncertain row with reason `'AI categorization unavailable'`.
 */
import { type EntityLookupEntry, type FinanceDb } from '../../../db/index.js';
import { AiCategorizationError } from './ai-categorizer-error.js';
import { categorizeWithAi, toCategorizerInput } from './ai-categorizer.js';
import { applyLearnedCorrection } from './apply-learned-correction.js';
import { matchEntity } from './entity-matcher.js';
import {
  type AiCategorizationResult,
  buildFailure,
  buildMatchedFromEntity,
  buildMatchedTransfer,
  buildUncertainFromAi,
  buildUncertainNoMatch,
} from './process-transaction-helpers.js';
import { isTransferOrIncomeRow } from './transfer-classifier.js';

import type {
  AiCounters,
  ParsedTransaction,
  ProcessContext,
  ProcessedTransaction,
} from './types.js';

export interface TransactionProcessResult {
  matched?: ProcessedTransaction;
  uncertain?: ProcessedTransaction;
  failed?: ProcessedTransaction;
  batchStatus: 'success' | 'failed';
  errorEntry?: { description: string; error: string };
}

export interface ProcessTransactionArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  context: ProcessContext;
  counters: AiCounters;
}

function tryEntityMatch(
  db: FinanceDb,
  transaction: ParsedTransaction,
  context: ProcessContext
): ProcessedTransaction | null {
  const match = matchEntity(transaction.description, context.entityLookup, context.aliases);
  if (!match) return null;
  const entry = context.entityLookup.get(match.entityName.toLowerCase());
  if (!entry) throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
  return buildMatchedFromEntity(db, {
    transaction,
    entry,
    matchType: match.matchType,
    knownTags: context.knownTags,
    entityDefaultTags: context.entityDefaultTags,
  });
}

async function tryAiCategorization(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters
): Promise<AiCategorizationResult | null> {
  let call: Awaited<ReturnType<typeof categorizeWithAi>>;
  try {
    call = await categorizeWithAi(
      toCategorizerInput(transaction),
      context.importBatchId,
      context.knownTags
    );
  } catch (err) {
    if (err instanceof AiCategorizationError) {
      counters.aiError = true;
      counters.aiFailureCount++;
      return null;
    }
    throw err;
  }
  const { result, usage } = call;
  if (usage) {
    counters.aiApiCalls++;
    counters.totalInputTokens += usage.inputTokens;
    counters.totalOutputTokens += usage.outputTokens;
    counters.totalCostUsd += usage.costUsd;
  } else if (result) {
    counters.aiCacheHits++;
  }
  if (!result?.entityName) return null;
  return {
    entityName: result.entityName,
    aiTags: result.tags ?? [],
    aiCategory: result.tags?.length ? null : (result.category ?? null),
  };
}

/**
 * Resolve the AI's suggested entity name against the same canonical +
 * alias lookups the deterministic matcher uses (CF024): the AI can only see
 * the transaction description, not which of several known spellings is
 * canonical, so a reply that happens to match a stored alias rather than the
 * entity's canonical name must still resolve — the deterministic stage one
 * step earlier would have.
 */
function resolveAiEntity(
  aiEntityName: string,
  context: ProcessContext
): EntityLookupEntry | undefined {
  const key = aiEntityName.toLowerCase();
  const direct = context.entityLookup.get(key);
  if (direct) return direct;
  const canonicalName = context.aliases.get(key);
  return canonicalName ? context.entityLookup.get(canonicalName.toLowerCase()) : undefined;
}

function resolveAiResult(
  db: FinanceDb,
  transaction: ParsedTransaction,
  ai: AiCategorizationResult,
  context: ProcessContext
): ProcessedTransaction {
  const entry = resolveAiEntity(ai.entityName, context);
  if (entry) {
    return buildMatchedFromEntity(db, {
      transaction,
      entry,
      matchType: 'ai',
      aiTags: ai.aiTags,
      category: ai.aiCategory,
      knownTags: context.knownTags,
      entityDefaultTags: context.entityDefaultTags,
    });
  }
  return buildUncertainFromAi(db, {
    transaction,
    entityName: ai.entityName,
    aiTags: ai.aiTags,
    aiCategory: ai.aiCategory,
    knownTags: context.knownTags,
  });
}

async function classifyTransaction(
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  const { db, transaction, context, counters } = args;

  const correctionApplied = applyLearnedCorrection(db, {
    transaction,
    minConfidence: 0.7,
    knownTags: context.knownTags,
    entityDefaultTags: context.entityDefaultTags,
  });
  if (correctionApplied) {
    return {
      [correctionApplied.bucket]: correctionApplied.processed,
      batchStatus: 'success',
    } as TransactionProcessResult;
  }

  if (isTransferOrIncomeRow(transaction)) {
    return {
      matched: buildMatchedTransfer(db, transaction, context.knownTags),
      batchStatus: 'success',
    };
  }

  const entityMatched = tryEntityMatch(db, transaction, context);
  if (entityMatched) return { matched: entityMatched, batchStatus: 'success' };

  const aiResult = await tryAiCategorization(transaction, context, counters);
  if (aiResult?.entityName) {
    const processed = resolveAiResult(db, transaction, aiResult, context);
    const bucket = processed.status === 'matched' ? 'matched' : 'uncertain';
    return { [bucket]: processed, batchStatus: 'success' } as TransactionProcessResult;
  }

  const reason = counters.aiError ? 'AI categorization unavailable' : 'No entity match found';
  return {
    uncertain: buildUncertainNoMatch(db, transaction, reason, context.knownTags),
    batchStatus: 'success',
  };
}

export async function processTransactionSafely(
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  try {
    return await classifyTransaction(args);
  } catch (error) {
    const { failed, errorEntry } = buildFailure(args.transaction, error);
    return { failed, batchStatus: 'failed', errorEntry };
  }
}
