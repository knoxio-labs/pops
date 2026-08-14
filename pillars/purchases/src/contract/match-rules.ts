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
