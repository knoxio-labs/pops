/**
 * Apply the highest-priority learned correction rule to a transaction.
 *
 * Ported from the monolith `lib/apply-learned-correction.ts`, db-injected:
 * - DB matching → `transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb`
 * - In-memory matching (merged/pending rules) → corrections module `findAllMatchingCorrectionFromRules`
 * - classification + tag parsing → corrections module helpers
 *
 * The rule's `transactionType` is applied whether or not the rule also names an
 * entity. It used to be carried only on the entity-less path, so a rule saying
 * "PAYMENT THANKYOU is ANZ, and it is a transfer" applied the merchant and
 * dropped the transfer, and the row committed as a `purchase` (POPS-2754). When
 * the rule carries no type at all, {@link resolveAppliedType} falls back to the
 * descriptor rather than leaving the row untyped.
 */
import { type FinanceDb, transactionCorrectionsService } from '../../../db/index.js';
import {
  classifyCorrectionMatch,
  type CorrectionRow,
  findAllMatchingCorrectionFromRules,
  resolveCorrectionApplyStatus,
} from '../corrections/index.js';
import { creditTagRuleUsage } from '../tag-suggester/index.js';
import { buildEntityMatch, buildTypeOnlyMatch } from './correction-match-builders.js';

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
  /** `contactId → defaultTags` from the per-run contacts fetch (entity tag source). */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
  /**
   * Decides, from the outcome, whether this application counts as a use of the
   * rule. Omitted ⇒ every outcome counts, which is right for an import: the
   * row had no classification before the rule gave it one.
   *
   * Re-evaluation needs the narrower answer. It re-applies rules to rows that
   * already carry the outcome, so an unchanged row would credit a rule that
   * did nothing — and a whole-ledger re-tag, which is deliberately a no-op,
   * would inflate every covered rule's counter by the ledger size (POPS-2641).
   * The predicate runs after the outcome is built and gates *all* usage
   * telemetry, the matched tag rules' included; `isPreview` still wins over it.
   */
  countsAsUsage?: (result: ApplyLearnedCorrectionResult) => boolean;
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

/**
 * `ApplyLearnedCorrectionArgs` plus the sink that collects the tag rules the
 * suggestion pass matched, so usage can be credited after the outcome is known
 * without running the match a second time.
 */
type ApplyArgs = ApplyLearnedCorrectionArgs & {
  collectTagRules: (ruleIds: readonly string[]) => void;
};

function handleNoEntityCorrection(
  db: FinanceDb,
  args: ApplyArgs,
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
      collectTagRules: args.collectTagRules,
    }),
    bucket: status,
  };
}

/**
 * The bucket the winning correction would land a transaction in, or `null` when
 * the rule has nothing to apply — decided from the rule alone, with no DB read
 * beyond the rule itself and no suggestion build.
 *
 * Exists so a caller can find out where a rule would put a row *before*
 * applying it, and skip the work entirely when the outcome is one it would
 * discard. The bucket decision lives here rather than in that caller so it
 * cannot drift from `resolveApplyResult`, which reads it back below.
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
  args: ApplyArgs,
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
      collectTagRules: args.collectTagRules,
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
 * against a real (non-preview) rule set, the rule actually produced an outcome,
 * and `countsAsUsage` accepts that outcome. The preview gate is
 * `!args.isPreview`, not whether `rules` was supplied: a fetch-once `rules`
 * array from the real table is still real usage, while a `rules` array merged
 * with un-persisted pending ChangeSets (`isPreview: true`) must never count as
 * usage of the persisted row.
 *
 * Crediting happens after the outcome is built, never during it — that is what
 * lets `countsAsUsage` see the outcome — so the matching tag rules are credited
 * here too rather than inside the suggestion pass, and both counters move under
 * exactly the same condition. The suggestion pass reports which rules it
 * matched (`onTagRulesMatched`) instead of being asked again, so deferring the
 * decision costs no extra query.
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
  const matchedTagRuleIds: string[] = [];
  const result = resolveApplyResult(
    db,
    { ...args, collectTagRules: (ids) => matchedTagRuleIds.push(...ids) },
    correction,
    matchedRules
  );

  if (result && !args.isPreview && (args.countsAsUsage?.(result) ?? true)) {
    transactionCorrectionsService.incrementTransactionCorrectionUsage(db, correction.id);
    creditTagRuleUsage(db, matchedTagRuleIds);
  }

  return result;
}
