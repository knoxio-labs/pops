/**
 * The three ways a correction-rule `add` op can be inert, and the guards that
 * refuse each one.
 *
 * A rule that is stored but can never fire is worse than a rejected one: it
 * reads as active in the editor and silently classifies nothing. All three
 * shapes are refused before anything is written.
 *
 * `applyChangeSet` throws on them (`assert*` below). The import-commit path
 * drops them instead — see `dropUnusableAddOps` in `./service.ts`, which
 * reuses {@link normalisesToNothing} for the same question in its
 * non-throwing form.
 */
import { transactionCorrectionsService, UnmatchablePatternError } from '../../../db/index.js';
import { ValidationError } from '../../shared/errors.js';

import type { ChangeSetOp } from '../../../contract/rest-corrections.js';

const { isTagsOnlyCorrectionInput, isValidRegexPattern, normalizePatternForStorage } =
  transactionCorrectionsService;

type AddOp = Extract<ChangeSetOp, { op: 'add' }>;

/**
 * Would this `add` op store an `exact`/`contains` pattern that normalises to
 * the empty string — `'1234'`, `'  '` — which `patternMatchesDescription`
 * refuses unconditionally, leaving an active rule nothing can ever fire
 * (POPS-3001)? `transaction_tag_rules` has refused this since POPS-2942;
 * corrections never did.
 */
export function normalisesToNothing(op: AddOp): boolean {
  if (op.data.matchType === 'regex') return false;
  return normalizePatternForStorage(op.data.descriptionPattern, op.data.matchType).length === 0;
}

/**
 * Reject a ChangeSet `add` whose data carries no `entityId`, no
 * `transactionType`, and non-empty `tags` — a tags-only row that violates the
 * classification-rule/tag-rule table boundary (CF061/#3650). Tag-only intent
 * belongs in a `transaction_tag_rules` ChangeSet, not here.
 */
export function assertNotTagsOnly(op: AddOp): void {
  if (isTagsOnlyCorrectionInput(op.data)) {
    throw new ValidationError(
      { tags: op.data.tags },
      'A correction rule needs an entityId or a transactionType — tags-only rules belong in transaction_tag_rules'
    );
  }
}

/**
 * Reject a ChangeSet `add` whose `regex` pattern doesn't compile. Every matcher
 * silently skips an uncompilable pattern, so storing one leaves a rule that
 * looks active and can never fire (POPS-2600).
 */
export function assertPatternCompiles(op: AddOp): void {
  if (op.data.matchType === 'regex' && !isValidRegexPattern(op.data.descriptionPattern)) {
    throw new ValidationError(
      { pattern: op.data.descriptionPattern },
      `Pattern is not a valid regular expression: ${op.data.descriptionPattern}`
    );
  }
}

/** Reject a ChangeSet `add` whose pattern normalises away (POPS-3001). */
export function assertPatternCanMatch(op: AddOp): void {
  if (!normalisesToNothing(op)) return;
  const unmatchable = new UnmatchablePatternError(op.data.descriptionPattern);
  throw new ValidationError(unmatchable.pattern, unmatchable.message);
}
