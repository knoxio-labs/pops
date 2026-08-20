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

/** Tests one stored pattern against already-normalised descriptors. */
export type MatchRulePredicate = (normalizedDescription: string) => boolean;

const NEVER_MATCHES: MatchRulePredicate = () => false;

/**
 * Turn a stored pattern into a predicate, doing the pattern's own work once.
 *
 * A reader tests one rule against every transaction in a charge's window,
 * so anything that depends on the pattern alone — uppercasing it, and for
 * `regex` the compile — belongs here rather than inside the loop. The
 * compile is the one that matters: `new RegExp` per candidate turns a
 * pathological stored pattern into a cost paid once per (charge,
 * transaction) pair instead of once per charge.
 *
 * Interpretation mirrors finance's `patternMatchesNormalizedDescription`
 * (`pillars/finance/src/db/services/transaction-corrections-types.ts`) for
 * the reason the module header gives, down to the regex flags: `i` and not
 * `iu`, because the unicode flag makes an identity escape (`\ `, `\-`) a
 * SyntaxError, and a pattern finance honours would then be silently inert
 * on this side of the seam.
 *
 * `contains` and `regex` are honoured even though the queue's writer only
 * ever stores `exact`: the column accepts all three, so a reader that
 * quietly ignored two of them would make a hand-written rule look stored
 * and inert.
 *
 * **One deliberate deviation.** An empty pattern matches nothing here for
 * every match type, where finance's `exact` lets one match a description
 * that normalises to empty. Digits alone normalise to empty — some
 * card-present terminals emit exactly that — so on this side an empty
 * pattern would auto-link every bare-reference descriptor in the window to
 * whichever order the rule was scoped to. {@link matchPatternFor} refuses
 * to write one for the same reason.
 *
 * An unparseable regex matches nothing rather than throwing. A sweep is a
 * batch over every charge in a window, so one malformed row must not be
 * able to abort the run — the failure would present as a whole night's
 * reconciliation not happening.
 */
export function compileMatchRulePattern(pattern: string, matchType: MatchType): MatchRulePredicate {
  if (pattern === '') return NEVER_MATCHES;
  switch (matchType) {
    case 'exact': {
      const wanted = pattern.toUpperCase();
      return (normalizedDescription) => wanted === normalizedDescription;
    }
    case 'contains': {
      const needle = pattern.toUpperCase();
      return (normalizedDescription) => normalizedDescription.includes(needle);
    }
    case 'regex': {
      const compiled = compiledOrNull(pattern);
      if (compiled === null) return NEVER_MATCHES;
      return (normalizedDescription) => compiled.test(normalizedDescription);
    }
  }
}

function compiledOrNull(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

/**
 * Does a stored pattern match an already-normalised descriptor?
 *
 * The caller normalises, because a reader testing many patterns against one
 * descriptor would otherwise re-normalise it per rule. A caller testing the
 * same pattern more than once wants {@link compileMatchRulePattern}, which
 * is what this is.
 */
export function matchRulePatternMatches(
  pattern: string,
  matchType: MatchType,
  normalizedDescription: string
): boolean {
  return compileMatchRulePattern(pattern, matchType)(normalizedDescription);
}
