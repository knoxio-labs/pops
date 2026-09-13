/**
 * Turning an AI categorization outcome into a row result: resolve the model's
 * merchant against the same lookups the deterministic matcher uses, attach the
 * AI tags with their provenance, and bucket the row.
 *
 * Split from `process-transaction.ts`, which runs the stages for one row,
 * because the batched import resolver (`ai-batch-resolver.ts`) finalizes rows
 * from a shared reply and needs this without the single-row stage runner.
 */
import { type EntityLookupEntry } from '../../../db/index.js';
import {
  buildFromEntityMatch,
  buildUncertainFromAi,
  buildUncertainNoMatch,
} from './process-transaction-helpers.js';

import type { AiCacheEntry } from './ai-categorizer.js';
import type { ProcessTransactionArgs, TransactionProcessResult } from './types.js';
import type { AiCounters, ProcessContext } from './types.js';

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
    const ai = {
      aiTags,
      aiProvenance: {
        promptVersion: aiEntry.promptVersion,
        confidence: aiEntry.tagConfidence,
        preAcceptThreshold: context.preAcceptThreshold,
      },
    };
    const processed = entry
      ? buildFromEntityMatch(db, {
          transaction,
          entry,
          matchType: 'ai',
          ...ai,
          category: aiCategory,
          confidence: aiEntry.confidence,
          knownTags: context.knownTags,
          entityDefaultTags: context.entityDefaultTags,
        })
      : buildUncertainFromAi(db, {
          transaction,
          entityName: aiEntry.entityName,
          ...ai,
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
