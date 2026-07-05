/**
 * Apply the highest-priority learned correction rule to a transaction.
 *
 * Ported from the monolith `lib/apply-learned-correction.ts`, db-injected:
 * - DB matching → `transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb`
 * - In-memory matching (merged/pending rules) → corrections module `findAllMatchingCorrectionFromRules`
 * - classification + tag parsing → corrections module helpers
 */
import { type FinanceDb, transactionCorrectionsService } from '../../../db/index.js';
import {
  classifyCorrectionMatch,
  type CorrectionMatchStatus,
  type CorrectionRow,
  findAllMatchingCorrectionFromRules,
  parseCorrectionTags,
  resolveCorrectionApplyStatus,
} from '../corrections/index.js';
import { buildSuggestedTags } from './tag-management.js';

import type { MatchedRule, ParsedTransaction, ProcessedTransaction } from './types.js';

export interface ApplyLearnedCorrectionArgs {
  transaction: ParsedTransaction;
  minConfidence: number;
  knownTags: string[];
  rules?: CorrectionRow[];
  /** `contactId → defaultTags` from the per-run contacts fetch (entity tag source). */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
}

export interface ApplyLearnedCorrectionResult {
  processed: ProcessedTransaction;
  bucket: 'matched' | 'uncertain';
}

function toMatchedRules(rules: CorrectionRow[]): MatchedRule[] {
  return rules.map((rule) => ({
    ruleId: rule.id,
    pattern: rule.descriptionPattern,
    matchType: rule.matchType,
    confidence: rule.confidence,
    priority: rule.priority,
    entityId: rule.entityId ?? null,
    entityName: rule.entityName ?? null,
  }));
}

interface TypeOnlyMatchArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  knownTags: string[];
  status: CorrectionMatchStatus;
  recordTagRuleUsage: boolean;
}

function buildTypeOnlyMatch(args: TypeOnlyMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, knownTags, status, recordTagRuleUsage } = args;
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    transactionType: correction.transactionType ?? undefined,
    entity: { matchType: 'learned', confidence: correction.confidence },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status,
    suggestedTags: buildSuggestedTags(db, {
      description: transaction.description,
      entityId: null,
      correctionTags: parseCorrectionTags(correction.tags),
      aiCategory: null,
      knownTags,
      correctionPattern: correction.descriptionPattern,
      recordTagRuleUsage,
    }),
  };
}

interface EntityMatchArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  status: 'matched' | 'uncertain';
  entityId: string;
  knownTags: string[];
  entityDefaultTags: ReadonlyMap<string, string[]>;
  recordTagRuleUsage: boolean;
}

function buildEntityMatch(args: EntityMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, status, entityId, knownTags } = args;
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    entity: {
      entityId,
      entityName: correction.entityName ?? 'Unknown',
      matchType: 'learned',
      confidence: correction.confidence,
    },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status,
    suggestedTags: buildSuggestedTags(db, {
      description: transaction.description,
      entityId,
      correctionTags: parseCorrectionTags(correction.tags),
      aiCategory: null,
      knownTags,
      correctionPattern: correction.descriptionPattern,
      entityDefaultTags: args.entityDefaultTags,
      recordTagRuleUsage: args.recordTagRuleUsage,
    }),
  };
}

function handleNoEntityCorrection(
  db: FinanceDb,
  args: ApplyLearnedCorrectionArgs,
  correction: CorrectionRow,
  matchedRules: MatchedRule[]
): ApplyLearnedCorrectionResult | null {
  const status = resolveCorrectionApplyStatus(correction);
  if (!status) return null;
  return {
    processed: buildTypeOnlyMatch({
      db,
      transaction: args.transaction,
      correction,
      matchedRules,
      knownTags: args.knownTags,
      status,
      recordTagRuleUsage: !args.rules,
    }),
    bucket: status,
  };
}

/**
 * Resolve the ChangeSet-application outcome for the winning correction, or
 * `null` when the rule carries neither an entity nor a transaction type (has
 * nothing to apply).
 */
function resolveApplyResult(
  db: FinanceDb,
  args: ApplyLearnedCorrectionArgs,
  correction: CorrectionRow,
  matchedRules: MatchedRule[]
): ApplyLearnedCorrectionResult | null {
  const entityId = correction.entityId;
  if (!entityId) return handleNoEntityCorrection(db, args, correction, matchedRules);

  const { status } = classifyCorrectionMatch(correction);
  return {
    processed: buildEntityMatch({
      db,
      transaction: args.transaction,
      correction,
      matchedRules,
      status,
      entityId,
      knownTags: args.knownTags,
      entityDefaultTags: args.entityDefaultTags ?? new Map(),
      recordTagRuleUsage: !args.rules,
    }),
    bucket: status === 'matched' ? 'matched' : 'uncertain',
  };
}

/**
 * Match `transaction.description` against the live correction rule set and
 * apply the winning rule.
 *
 * Usage telemetry (`timesApplied`/`lastUsedAt`) is bumped only when the match
 * is against the real persisted rule set (`args.rules` absent) AND the rule
 * actually produced an outcome — a caller-supplied `rules` array is always an
 * in-memory preview (merged with un-persisted pending ChangeSets) and must
 * never count as real usage of the persisted row. The same `!rules` gate is
 * threaded into the suggested-tags computation so a matching tag rule's own
 * usage counter is bumped under the identical condition.
 */
export function applyLearnedCorrection(
  db: FinanceDb,
  args: ApplyLearnedCorrectionArgs
): ApplyLearnedCorrectionResult | null {
  const { transaction, minConfidence, rules } = args;

  const allMatchingRules = rules
    ? findAllMatchingCorrectionFromRules(transaction.description, rules, minConfidence)
    : transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb(
        db,
        transaction.description,
        minConfidence
      );

  const correction = allMatchingRules[0];
  if (!correction) return null;

  const matchedRules = toMatchedRules(allMatchingRules);
  const result = resolveApplyResult(db, args, correction, matchedRules);

  if (result && !rules) {
    transactionCorrectionsService.incrementTransactionCorrectionUsage(db, correction.id);
  }

  return result;
}
