/**
 * Pure helpers for `purchase_match_rules` — the descriptor side of the
 * matcher's memory.
 *
 * Lives in the contract rather than beside the database because the pattern
 * a rule stores and the pattern a reader compares against must be produced
 * by one function. A writer that normalised and a reader that did not would
 * build a table whose rows can never match anything, and the failure is
 * invisible: every lookup simply misses.
 *
 * The normaliser is finance's `normalizeDescription`
 * (`pillars/finance/src/contract/corrections-pure.ts`) reproduced rather
 * than imported. `purchase_match_rules` mirrors `transaction_corrections`
 * field-for-field so a rule means the same thing on both sides of the seam,
 * and that equivalence has to survive the two pillars being deployed,
 * migrated and restored independently (ADR-042) — a source import across
 * the boundary would trade a documented mirror for a build-time coupling
 * neither pillar's package boundary allows.
 */
import type { MatchType } from './constants.js';

/**
 * Canonicalise a bank descriptor for matching: fold diacritics, treat
 * hyphens as a space, drop ampersands and periods, uppercase, strip digits,
 * collapse whitespace.
 *
 * Stripping digits is what makes the result a merchant rather than one
 * transaction: `WOOLWORTHS 1234 SYDNEY` and `WOOLWORTHS 5567 SYDNEY` are
 * the same shop to a human and the same pattern after this.
 */
export function normalizeMatchDescriptor(description: string): string {
  return description
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .replaceAll(/-/gu, ' ')
    .replaceAll(/[&.]/gu, '')
    .toUpperCase()
    .replaceAll(/\d+/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/**
 * The pattern a decision on `description` should be stored under, or null
 * when the descriptor carries nothing a rule could key on.
 *
 * Null is a real outcome rather than a defensive branch: a descriptor of
 * digits alone — some card-present terminals emit exactly that — normalises
 * to the empty string, and a rule with an empty pattern would match by
 * accident rather than by evidence.
 */
export function matchPatternFor(description: string | null): string | null {
  if (description === null) return null;
  const normalized = normalizeMatchDescriptor(description);
  return normalized === '' ? null : normalized;
}

/**
 * Does a stored pattern match an already-normalised descriptor?
 *
 * The caller normalises, because a reader testing many patterns against one
 * descriptor would otherwise re-normalise it per rule.
 *
 * Mirrors finance's `patternMatchesNormalizedDescription`
 * (`pillars/finance/src/db/services/transaction-corrections-types.ts`) for
 * the reason the module header gives. `contains` and `regex` are honoured
 * even though the queue's writer only ever stores `exact`: the column
 * accepts all three, so a reader that quietly ignored two of them would
 * make a hand-written rule look stored and inert.
 *
 * An empty pattern matches nothing, and an unparseable regex matches
 * nothing rather than throwing. A sweep is a batch over every charge in a
 * window, so one malformed row must not be able to abort the run — the
 * failure would present as a whole night's reconciliation not happening.
 */
export function matchRulePatternMatches(
  pattern: string,
  matchType: MatchType,
  normalizedDescription: string
): boolean {
  if (pattern === '') return false;
  switch (matchType) {
    case 'exact':
      return pattern.toUpperCase() === normalizedDescription;
    case 'contains':
      return normalizedDescription.includes(pattern.toUpperCase());
    case 'regex':
      try {
        return new RegExp(pattern, 'iu').test(normalizedDescription);
      } catch {
        return false;
      }
  }
}
