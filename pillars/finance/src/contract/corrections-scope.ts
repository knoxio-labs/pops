/**
 * The account-scope semantics for correction rules (POPS-2593), split out of
 * `corrections-pure.ts` to keep that file under the 200-line cap.
 *
 * Pure and dependency-free like its sibling: the browser-side optimistic merge
 * and the pillar-side matchers must agree on which rules a transaction can see
 * and which of them wins, so both halves import these two functions rather
 * than re-deriving the rule.
 *
 * Both take a bare `{ accountId }` rather than a whole `CorrectionRow`: that
 * keeps this module free of any import from `corrections-pure.ts`, which
 * re-exports it, so the two do not form a cycle.
 */

/** The only part of a correction rule the scope rules read. */
export interface ScopedRule {
  accountId: string | null;
}

/**
 * Does a rule apply to a transaction on `accountId`?
 *
 * An unscoped rule (`rule.accountId === null`) applies everywhere — that is
 * what every pre-POPS-2593 row migrated to, and what every proposal surface
 * still emits, so the default behaviour is unchanged. A scoped rule applies
 * only to its own account and is invisible to every other one: that is the
 * whole point, and it is why Bank A's `LATE FEE` can no longer be stamped
 * with Bank B's merchant.
 *
 * `accountId === null` means the CALLER has no account in hand — a
 * description-only probe such as the rule browser's `findMatch`, or a
 * ChangeSet preview over caller-supplied descriptions. Those see every rule,
 * scoped or not, because narrowing to global-only would under-report which
 * rules a string actually hits. Only a caller that knows the account narrows.
 */
export function ruleAppliesToAccount(rule: ScopedRule, accountId: string | null): boolean {
  if (rule.accountId === null) return true;
  if (accountId === null) return true;
  return rule.accountId === accountId;
}

/**
 * Ordering comparator for the account scope, applied as the OUTERMOST key of
 * every correction matcher: an account-scoped rule sorts before an unscoped
 * one.
 *
 * Scope beats `priority`, `confidence` and the match-type grouping alike,
 * rather than joining them as one more tie-breaker. Scoping a rule is a
 * deliberate, opt-in act by an operator who has decided this merchant is
 * account-specific; every other ordering key is a heuristic the engine
 * maintains on its own. If scope merely joined that pile, a global rule that
 * happened to carry `priority: 0` would silently outrank the scoped rule
 * written to overrule it — the opt-in would not survive contact with the rule
 * set it was created to correct, which is the failure POPS-2593 describes.
 * Specificity-wins is also the rule every reader already knows from CSS and
 * from HTTP route matching, so it needs no per-call-site explanation.
 *
 * Returns 0 for two rules in the same scope tier, leaving the caller's
 * existing ordering to decide between them.
 */
export function compareRuleScope(a: ScopedRule, b: ScopedRule): number {
  const aTier = a.accountId !== null ? 0 : 1;
  const bTier = b.accountId !== null ? 0 : 1;
  return aTier - bTier;
}
