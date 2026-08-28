/**
 * Single-transaction classification: correction rules → descriptor-derived type
 * (fees, inbound card payments — POPS-2610) → entity matcher → AI fallback →
 * no-match.
 *
 * The descriptor stage sits below the user's own correction rules (an explicit
 * rule still wins) and above the entity matcher, which has no merchant to find
 * on an `INTEREST CHARGES` row and would otherwise leave it uncertain and
 * untyped.
 *
 * Ported from the monolith `lib/process-transaction.ts`, db-injected. The
 * non-AI stages (`classifyWithoutAi`) and the AI-result finalizer
 * (`finalizeAiResult`) are exported separately so the import batch resolver
 * (`ai-batch-resolver.ts`, CP025/#3656) can run the cheap stages per row and
 * defer the AI stage to a shared batched call instead of one round-trip per
 * row; `classifyTransaction`/`processTransactionSafely` compose the same two
 * pieces for a single row. When the categorizer is disabled (the default) the
 * AI stage short-circuits before any call, the disabled counters are set so
 * the run carries an `AI_CATEGORIZATION_UNAVAILABLE` warning, and the row's
 * reason is `'No entity match found (AI categorization disabled)'`. An
 * `AiCategorizationError` (enabled but key/API failure) degrades to an
 * uncertain row with reason `'AI categorization unavailable'`.
 */
import { MIN_MATCH_CONFIDENCE } from '../../../contract/corrections-pure.js';
import { type EntityLookupEntry, type FinanceDb } from '../../../db/index.js';
import { AiCategorizationError } from './ai-categorizer-error.js';
import {
  type AiCacheEntry,
  categorizeWithAi,
  isAiCategorizerEnabled,
  toCategorizerInput,
} from './ai-categorizer.js';
import { applyLearnedCorrection } from './apply-learned-correction.js';
import { matchEntity } from './entity-matcher.js';
import { buildKnownEntityHint } from './entity-vocabulary.js';
import {
  buildFailure,
  buildFromEntityMatch,
  buildUncertainFromAi,
  buildUncertainNoMatch,
  matchDerivedType,
} from './process-transaction-helpers.js';

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

/** Outcome of the non-AI classification stages — either a final result, or a signal that the row needs the AI fallback. */
export type ClassifyStageResult =
  | { kind: 'resolved'; result: TransactionProcessResult }
  | { kind: 'needsAi' };

function tryEntityMatch(
  db: FinanceDb,
  transaction: ParsedTransaction,
  context: ProcessContext
): ProcessedTransaction | null {
  const match = matchEntity(transaction.description, context.entityLookup, context.aliases);
  if (!match) return null;
  const entry = context.entityLookup.get(match.entityName.toLowerCase());
  if (!entry) throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
  return buildFromEntityMatch(db, {
    transaction,
    entry,
    matchType: match.matchType,
    knownTags: context.knownTags,
    entityDefaultTags: context.entityDefaultTags,
  });
}

/**
 * Run the correction/descriptor/entity-match ladder for one row, without ever
 * calling the AI. Returns `{kind:'needsAi'}` when none of those stages
 * resolve it, so the caller can route the row to either the single-row AI
 * fallback (`classifyTransaction`) or a shared batched call
 * (`ai-batch-resolver.ts`).
 */
export function classifyWithoutAi(args: ProcessTransactionArgs): ClassifyStageResult {
  const { db, transaction, context } = args;

  const correctionApplied = applyLearnedCorrection(db, {
    transaction,
    minConfidence: MIN_MATCH_CONFIDENCE,
    knownTags: context.knownTags,
    rules: context.correctionRules,
    entityDefaultTags: context.entityDefaultTags,
  });
  if (correctionApplied) {
    return {
      kind: 'resolved',
      result: {
        [correctionApplied.bucket]: correctionApplied.processed,
        batchStatus: 'success',
      } as TransactionProcessResult,
    };
  }

  const derived = matchDerivedType(db, transaction, context.knownTags);
  if (derived) return { kind: 'resolved', result: { matched: derived, batchStatus: 'success' } };

  const entityMatched = tryEntityMatch(db, transaction, context);
  if (entityMatched) {
    const bucket = entityMatched.status === 'matched' ? 'matched' : 'uncertain';
    return {
      kind: 'resolved',
      result: { [bucket]: entityMatched, batchStatus: 'success' } as TransactionProcessResult,
    };
  }

  return { kind: 'needsAi' };
}

async function tryAiCategorization(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters
): Promise<AiCacheEntry | null> {
  if (!isAiCategorizerEnabled()) {
    counters.aiDisabled = true;
    counters.aiDisabledCount++;
    return null;
  }
  let call: Awaited<ReturnType<typeof categorizeWithAi>>;
  try {
    call = await categorizeWithAi(
      toCategorizerInput(transaction),
      context.importBatchId,
      context.knownTags,
      buildKnownEntityHint(context.entityLookup)
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
  return result;
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

/**
 * Turn an AI categorization outcome (or `null`, on a disabled/failed/no-op
 * call) into the row's final `TransactionProcessResult`. Shared by the
 * single-row path (`classifyTransaction`) and the batched import resolver, so
 * both routes bucket a batch reply exactly like a live per-row call would.
 */
export function finalizeAiResult(
  args: ProcessTransactionArgs,
  aiEntry: AiCacheEntry | null
): TransactionProcessResult {
  const { db, transaction, context, counters } = args;
  counters.aiTagValuesRejected += aiEntry?.rejectedTagValues ?? 0;
  if (aiEntry?.entityName) {
    const aiTags = aiEntry.tags ?? [];
    const aiCategory = aiEntry.tags?.length ? null : (aiEntry.category ?? null);
    const entry = resolveAiEntity(aiEntry.entityName, context);
    const processed = entry
      ? buildFromEntityMatch(db, {
          transaction,
          entry,
          matchType: 'ai',
          aiTags,
          category: aiCategory,
          confidence: aiEntry.confidence,
          knownTags: context.knownTags,
          entityDefaultTags: context.entityDefaultTags,
        })
      : buildUncertainFromAi(db, {
          transaction,
          entityName: aiEntry.entityName,
          aiTags,
          aiCategory,
          confidence: aiEntry.confidence,
          knownTags: context.knownTags,
        });
    const bucket = processed.status === 'matched' ? 'matched' : 'uncertain';
    return { [bucket]: processed, batchStatus: 'success' } as TransactionProcessResult;
  }

  return {
    uncertain: buildUncertainNoMatch(db, transaction, noMatchReason(counters), context.knownTags),
    batchStatus: 'success',
  };
}

function noMatchReason(counters: AiCounters): string {
  if (counters.aiError) return 'AI categorization unavailable';
  if (counters.aiDisabled) return 'No entity match found (AI categorization disabled)';
  return 'No entity match found';
}

async function classifyTransaction(
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  const staged = classifyWithoutAi(args);
  if (staged.kind === 'resolved') return staged.result;

  const { transaction, context, counters } = args;
  const aiEntry = await tryAiCategorization(transaction, context, counters);
  return finalizeAiResult(args, aiEntry);
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
