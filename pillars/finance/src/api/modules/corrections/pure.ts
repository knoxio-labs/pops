/**
 * Pure, in-memory correction-rule matchers + ChangeSet application.
 *
 * The rule matchers (`ruleMatchesDescription`, `findAll*`) are copied (per the
 * severance rules) from the monolith. ChangeSet application is delegated to the
 * contract's shared {@link applyChangeSetToRulesPure} so the pillar and the
 * `app-finance` optimistic merge run one implementation; this wrapper injects
 * the pillar's `NotFoundError` so a missing edit/disable/remove target maps to
 * a 404 on the REST surface.
 *
 * `describeForMatching` and `patternMatchesDescription` come from the
 * pillar's own `transactionCorrectionsService` so normalisation and the match
 * verdict are identical to the DB-side matcher (POPS-2600).
 */
import {
  applyChangeSetToRules as applyChangeSetToRulesPure,
  compareRuleScope,
  MIN_MATCH_CONFIDENCE,
  ruleAppliesToAccount,
} from '../../../contract/corrections-pure.js';
import { transactionCorrectionsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { classifyCorrectionMatch } from './types.js';

import type { MatchableDescription } from '../../../contract/pattern-match.js';
import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type { CorrectionMatchResult, CorrectionRow } from './types.js';

const { describeForMatching, patternMatchesDescription } = transactionCorrectionsService;

/**
 * Test whether a single rule's pattern matches a description, supplied in both
 * the raw and normalised forms the matcher picks between by match type.
 *
 * Delegates to the one shared predicate (POPS-2600) rather than carrying its
 * own copy — this used to be a fifth independent implementation.
 */
export function ruleMatchesDescription(
  rule: CorrectionRow,
  description: MatchableDescription
): boolean {
  return patternMatchesDescription(rule.descriptionPattern, rule.matchType, description);
}

/**
 * Return ALL matching correction rules, account-scoped rules first, then in
 * priority order (priority ASC, id ASC). The first entry is the winner;
 * subsequent entries are overridden alternatives. Inactive rules, rules below
 * `minConfidence`, and rules scoped to a different account are filtered out
 * first.
 *
 * `accountId` is the transaction's `accounts.id`, or `null` for a caller with
 * no account in hand (a description-only probe), which sees every rule. Scope
 * is the outermost ordering key, so an account-scoped rule beats a global one
 * on the same description whatever their priorities — see
 * {@link compareRuleScope} (POPS-2593). It is a required parameter rather than
 * a defaulted one: either answer would be silently wrong for half the callers,
 * so each one has to state which it is.
 *
 * Filtering (active + confidence + scope + pattern match) runs before the
 * sort, so only the matched subset — usually zero or one row — is sorted, not
 * the full rule set. That keeps a per-transaction import loop that threads one
 * fetched-once rule array through every call at O(rules) per row instead of
 * O(rules·log rules) (CF040/#3664).
 */
export function findAllMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  accountId: string | null,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): CorrectionRow[] {
  const matchable = describeForMatching(description);
  return rules
    .filter(
      (rule) =>
        rule.isActive &&
        rule.confidence >= minConfidence &&
        ruleAppliesToAccount(rule, accountId) &&
        ruleMatchesDescription(rule, matchable)
    )
    .toSorted((a, b) => {
      const scope = compareRuleScope(a, b);
      if (scope !== 0) return scope;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
}

/**
 * Winning rule for `description` on `accountId`, classified — or null when
 * none match. Account-scoped rules win over global ones; see
 * {@link findAllMatchingCorrectionFromRules}.
 */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  accountId: string | null,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): CorrectionMatchResult | null {
  const first = findAllMatchingCorrectionFromRules(description, rules, accountId, minConfidence)[0];
  return first ? classifyCorrectionMatch(first) : null;
}

/**
 * Apply a ChangeSet to an in-memory rule array (no DB). Delegates to the
 * contract's shared, dependency-free implementation, injecting the pillar's
 * `NotFoundError` so a missing edit/disable/remove target surfaces as a 404.
 */
export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  return applyChangeSetToRulesPure(rules, changeSet, (id) => {
    throw new NotFoundError('Correction', id);
  });
}
