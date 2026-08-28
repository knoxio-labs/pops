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
  MIN_MATCH_CONFIDENCE,
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
 * Return ALL matching correction rules in priority order (priority ASC, id ASC).
 * The first entry is the winner; subsequent entries are overridden alternatives.
 * Inactive rules and rules below `minConfidence` are filtered out first.
 *
 * Filtering (active + confidence + pattern match) runs before the sort, so only
 * the matched subset — usually zero or one row — is sorted, not the full rule
 * set. That keeps a per-transaction import loop that threads one fetched-once
 * rule array through every call at O(rules) per row instead of
 * O(rules·log rules) (CF040/#3664).
 */
export function findAllMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = MIN_MATCH_CONFIDENCE
): CorrectionRow[] {
  const matchable = describeForMatching(description);
  return rules
    .filter(
      (rule) =>
        rule.isActive && rule.confidence >= minConfidence && ruleMatchesDescription(rule, matchable)
    )
    .toSorted((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
}

/** First matching rule in priority order, classified — or null when none match. */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = MIN_MATCH_CONFIDENCE
): CorrectionMatchResult | null {
  const first = findAllMatchingCorrectionFromRules(description, rules, minConfidence)[0];
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
