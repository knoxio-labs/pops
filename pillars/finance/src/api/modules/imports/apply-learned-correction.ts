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
  /**
   * True when `rules` is an in-memory preview merged with un-persisted pending
   * ChangeSets rather than the real persisted rule set (CF040/#3664) — gates
   * usage telemetry (`timesApplied`/`lastUsedAt`, tag-rule usage) so a preview
   * never counts as real application. The telemetry gate is purely `!isPreview`
   * — it is honoured on every path, `rules` supplied or not. The `rules`-omitted
   * DB-query path counts as real usage not because the flag is skipped there but
   * because those one-off callers never set it (a preview only exists as an
   * in-memory merged `rules` array). Defaults to `false`: a caller-supplied
   * `rules` array fetched once per run from the real table (the perf fix this
   * flag exists for) still counts as usage.
   */
  isPreview?: boolean;
  /**
   * Overrides the `!isPreview` telemetry gate for this one call.
   *
   * `isPreview` says *what the rules are* — un-persisted, so crediting them
   * would credit a row that does not exist. This says *whether this particular
   * application is worth crediting*, which is a different question, and the
   * re-apply-to-matched path is where they come apart: the rules are real, but
   * an application that leaves the row exactly as it was did not apply anything
   * (POPS-2641). Omitted, it defaults to `!isPreview` and nothing changes.
   */
  recordUsage?: boolean;
  /** `contactId → defaultTags` from the per-run contacts fetch (entity tag source). */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
}

/** Whether this call should credit usage — see {@link ApplyLearnedCorrectionArgs.recordUsage}. */
function shouldRecordUsage(args: ApplyLearnedCorrectionArgs): boolean {
  return args.recordUsage ?? !args.isPreview;
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
      recordTagRuleUsage: shouldRecordUsage(args),
    }),
    bucket: status,
  };
}

/**
 * The bucket the winning correction would land a transaction in, or `null` when
 * the rule has nothing to apply — decided from the rule alone, with no DB write
 * and no usage telemetry.
 *
 * Exists so a caller can find out where a rule would put a row *before*
 * applying it: `applyLearnedCorrection` bumps `timesApplied` as soon as it
 * produces an outcome, so a caller that inspects the outcome and then discards
 * it has already credited a rule that changed nothing. The bucket decision
 * lives here rather than in that caller so it cannot drift from
 * `resolveApplyResult`, which reads it back below.
 */
export function correctionOutcomeBucket(correction: CorrectionRow): 'matched' | 'uncertain' | null {
  if (!correction.entityId) return resolveCorrectionApplyStatus(correction);
  return classifyCorrectionMatch(correction).status === 'matched' ? 'matched' : 'uncertain';
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
      recordTagRuleUsage: shouldRecordUsage(args),
    }),
    bucket: status === 'matched' ? 'matched' : 'uncertain',
  };
}

/**
 * Match `transaction.description` against the correction rule set and apply
 * the winning rule.
 *
 * `rules`, when supplied, is matched in-memory (`findAllMatchingCorrectionFromRules`)
 * instead of re-querying the DB — the fetch-once-per-run path (CF040/#3664):
 * callers that process many transactions in a loop fetch the active rule set a
 * single time up front and thread it through every call, instead of issuing a
 * fresh SELECT+sort per transaction. `rules` omitted falls back to a live DB
 * query per call, for one-off callers with no run-level rule set to share.
 *
 * Usage telemetry (`timesApplied`/`lastUsedAt`) is bumped whenever the match is
 * against a real (non-preview) rule set AND the rule actually produced an
 * outcome — gated by `!args.isPreview`, not by whether `rules` was supplied:
 * a fetch-once `rules` array from the real table is still real usage, while a
 * `rules` array merged with un-persisted pending ChangeSets (`isPreview: true`)
 * must never count as usage of the persisted row. The same gate is threaded
 * into the suggested-tags computation so a matching tag rule's own usage
 * counter is bumped under the identical condition. `recordUsage` overrides that
 * gate for a caller that can only tell whether the application was real after
 * seeing the result — see its docstring.
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

  if (result && shouldRecordUsage(args)) {
    transactionCorrectionsService.incrementTransactionCorrectionUsage(db, correction.id);
  }

  return result;
}
