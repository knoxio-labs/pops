/**
 * ProcessedTransaction builders for each classification outcome.
 *
 * Ported from the monolith `lib/process-transaction-helpers.ts`, db-injected:
 * every builder takes a `FinanceDb` handle so it can resolve suggested tags
 * through the pillar's tag-suggester.
 */
import { type FinanceDb } from '../../../db/index.js';
import { formatImportError } from './format-error.js';
import { buildSuggestedTags } from './tag-management.js';

import type { EntityLookupEntry } from '../../../db/index.js';
import type { ErrorEntry, ParsedTransaction, ProcessedTransaction } from './types.js';

export interface MatchedFromEntityArgs {
  transaction: ParsedTransaction;
  entry: EntityLookupEntry;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains' | 'ai';
  aiTags?: string[];
  category?: string | null;
  /** Model-reported confidence, carried onto the entity for `matchType: 'ai'` only. */
  confidence?: number;
  knownTags: string[];
  entityDefaultTags: ReadonlyMap<string, string[]>;
}

/**
 * Build the classification for an entity match (deterministic or AI). The
 * default-type policy (#3607 stage 2b) is direction-aware:
 *
 *  - a **debit** (amount < 0) with a resolved merchant is a `matched`
 *    `purchase` — the one type a code path may assign without an explicit rule;
 *  - a **credit** (amount >= 0) is left `uncertain` with NO defaulted type,
 *    *even though the entity resolved*. A positive-amount entity match (a salary
 *    from a matched employer, a refund from a matched merchant) is semantically
 *    ambiguous — it must never silently commit as a purchase. It surfaces for
 *    review, still carrying the entity, until a correction rule assigns the real
 *    type (`income`/`refund`/…).
 */
export function buildFromEntityMatch(
  db: FinanceDb,
  args: MatchedFromEntityArgs
): ProcessedTransaction {
  const isDebit = args.transaction.amount < 0;
  return {
    ...args.transaction,
    entity: {
      entityId: args.entry.id,
      entityName: args.entry.name,
      matchType: args.matchType,
      ...(args.matchType === 'ai' && args.confidence !== undefined
        ? { confidence: args.confidence }
        : {}),
    },
    status: isDebit ? 'matched' : 'uncertain',
    transactionType: isDebit ? 'purchase' : undefined,
    suggestedTags: buildSuggestedTags(db, {
      description: args.transaction.description,
      entityId: args.entry.id,
      correctionTags: [],
      aiTags: args.aiTags,
      aiCategory: args.category ?? null,
      knownTags: args.knownTags,
      entityDefaultTags: args.entityDefaultTags,
    }),
  };
}

export interface UncertainFromAiArgs {
  transaction: ParsedTransaction;
  entityName: string;
  aiTags: string[];
  aiCategory: string | null;
  /** The model's reported confidence (0.0-1.0) that `entityName` is correct (CF037/#3655). */
  confidence: number;
  knownTags: string[];
}

export function buildUncertainFromAi(
  db: FinanceDb,
  args: UncertainFromAiArgs
): ProcessedTransaction {
  return {
    ...args.transaction,
    entity: { entityName: args.entityName, matchType: 'ai', confidence: args.confidence },
    status: 'uncertain',
    suggestedTags: buildSuggestedTags(db, {
      description: args.transaction.description,
      entityId: null,
      correctionTags: [],
      aiTags: args.aiTags,
      aiCategory: args.aiCategory,
      knownTags: args.knownTags,
    }),
  };
}

export function buildUncertainNoMatch(
  db: FinanceDb,
  transaction: ParsedTransaction,
  reason: string,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'uncertain',
    error: reason,
    suggestedTags: buildSuggestedTags(db, {
      description: transaction.description,
      entityId: null,
      correctionTags: [],
      aiCategory: null,
      knownTags,
    }),
  };
}

export function buildFailure(
  transaction: ParsedTransaction,
  error: unknown
): { failed: ProcessedTransaction; message: string; errorEntry: ErrorEntry } {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const failed: ProcessedTransaction = {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'failed',
    error: message,
  };
  const formatted = formatImportError(error, { transaction: transaction.description });
  return {
    failed,
    message,
    errorEntry: {
      description: transaction.description.slice(0, 50),
      error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
    },
  };
}
