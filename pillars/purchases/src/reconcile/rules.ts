/**
 * Stage 4 — which learned rule, if any, speaks for a descriptor.
 *
 * `purchase_match_rules` is a descriptor-pattern table mirroring finance's
 * `transaction_corrections`, so a rule says something about which
 * transactions look like a given merchant. It cannot name the transaction
 * that settles a given order, and nothing here pretends otherwise: the
 * matcher's whole output is "a human has accepted a descriptor like this
 * for this source before".
 *
 * What the ladder does with that is decided in `stages.ts` and it is
 * deliberately the smallest useful thing — the candidate is admitted, and
 * then has to survive the same exact-amount test as any other. A rule that
 * could license a near-miss amount would undercut the premise the whole
 * engine rests on, that matching is arithmetic.
 */
import { MIN_MATCH_CONFIDENCE } from '../contract/constants.js';
import { matchRulePatternMatches, normalizeMatchDescriptor } from '../contract/match-rules.js';

import type { SolvableCharge, SolvableRule } from './types.js';

/** The rule that speaks for a descriptor, or null when none does. */
export type LearnedRuleMatcher = (descriptor: string) => SolvableRule | null;

const NO_RULE: LearnedRuleMatcher = () => null;

/**
 * The rules that apply to one charge, in the order they are consulted.
 *
 * Three filters, each of which the table's own columns ask for:
 *
 * - `isActive`, because deactivating a rule is how a human retracts it.
 * - `confidence` at or above `MIN_MATCH_CONFIDENCE`, the floor finance
 *   applies to the mirrored table. A rule learned from a part-payment
 *   confirm inherits that link's confidence, and the floor is what keeps
 *   the weakest of those out of the ladder entirely.
 * - source scope. A rule is decided for one merchant's orders; a null
 *   source is a human's deliberate act and applies everywhere.
 *
 * **`priority ASC, id ASC`, never array order.** More than one rule can
 * match a descriptor, and the link records which one was responsible, so a
 * `.find()` over whatever order the reader returned would make the solver's
 * output depend on its input's order — the one property re-derivation
 * cannot survive losing.
 */
export function rulesFor(
  charge: SolvableCharge,
  rules: readonly SolvableRule[]
): readonly SolvableRule[] {
  return rules
    .filter(
      (rule) =>
        rule.isActive &&
        rule.confidence >= MIN_MATCH_CONFIDENCE &&
        (rule.source === null || rule.source === charge.source)
    )
    .toSorted((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/**
 * Compile one charge's rules into a matcher, for reuse across its
 * candidates.
 *
 * A matcher rather than a per-candidate call for the reason
 * `descriptorMatcherFor` is one: the scoping, sorting and — for a `regex`
 * rule — the regex compile happen once per charge instead of once per
 * transaction in its window.
 */
export function ruleMatcherFor(
  charge: SolvableCharge,
  rules: readonly SolvableRule[]
): LearnedRuleMatcher {
  const scoped = rulesFor(charge, rules);
  if (scoped.length === 0) return NO_RULE;

  return (descriptor) => {
    const normalized = normalizeMatchDescriptor(descriptor);
    return (
      scoped.find((rule) =>
        matchRulePatternMatches(rule.descriptionPattern, rule.matchType, normalized)
      ) ?? null
    );
  };
}
