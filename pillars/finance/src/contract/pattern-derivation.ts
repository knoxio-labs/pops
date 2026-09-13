/**
 * Deriving a `contains` pattern from the descriptions a rule is meant to
 * match, rather than from the merchant's name.
 *
 * An entity name is a tidy label a human or the matcher chose; the descriptor
 * is what the bank actually sent, and the two routinely fail to line up under
 * {@link normalizeDescription}, which inserts no word boundaries and strips
 * neither `*` nor a bank's mid-word truncation. `MICROSOFT STORE` is not
 * contained in `MICROSOFT*STORE`, and `RATTLE N HUM BAR GRILL` is longer than
 * the `RATTLE N HUM BAR GRI` it would have to be contained in. Both stored as
 * rules that could never fire (POPS-2758).
 *
 * Lives beside {@link patternMatchesDescription} rather than in the import
 * wizard that first needed it, because the repair pass for the rules already
 * stored under the old derivation has to produce byte-identical patterns
 * (POPS-2940). Two implementations of this would drift, and the drift would
 * be invisible: both sides would keep minting plausible-looking rules.
 *
 * Dependency-free and browser-safe, like its neighbour.
 */
import {
  describeForMatching,
  normalizeDescription,
  patternMatchesDescription,
} from './pattern-match.js';

/**
 * The shortest derived pattern worth storing as a `contains` rule.
 *
 * The longest common substring of two descriptors that share no merchant is a
 * fragment of a word — `RATTLE N HUM` and `MICROSOFT*STORE` have `S` in common
 * — and a rule on a fragment tags everything. Below this length the set is
 * treated as having no usable pattern, which is the safe direction: a missing
 * rule is visible on the next import, an over-broad one silently mislabels the
 * whole ledger.
 */
export const MIN_DERIVED_PATTERN_LENGTH = 4;

/**
 * The longest string contained in every one of `values`, or `''`.
 *
 * Scans the substrings of the shortest input from longest to shortest, so the
 * first candidate every other value contains is by definition the longest.
 * Descriptors are bank-statement length and a set is one merchant's rows, so
 * the cubic worst case is never approached in practice.
 */
export function longestCommonSubstring(values: string[]): string {
  const [shortest, ...rest] = values.toSorted((a, b) => a.length - b.length);
  if (shortest === undefined) return '';
  for (let length = shortest.length; length > 0; length--) {
    for (let start = 0; start + length <= shortest.length; start++) {
      const candidate = shortest.slice(start, start + length);
      if (rest.every((value) => value.includes(candidate))) return candidate;
    }
  }
  return '';
}

/**
 * Whether `pattern` is too thin on its own to identify a merchant: nothing
 * but a run of digits once every digit is stripped out.
 *
 * A statement line's reference number, a card's last four digits or a store
 * number (`2200`, `215`) recurs across unrelated merchants, so a pattern that
 * is *only* digits — or reduces to fewer than {@link MIN_DERIVED_PATTERN_LENGTH}
 * characters once its digits are removed — tags everything that happens to
 * share that number rather than the merchant the rule was meant for
 * (POPS-3665). `7 ELEVEN 2041`, by contrast, keeps `ELEVEN` after the digits
 * are stripped and is left alone.
 */
function lacksNonDigitContent(pattern: string): boolean {
  return pattern.replaceAll(/[0-9]/g, '').trim().length < MIN_DERIVED_PATTERN_LENGTH;
}

/**
 * The `contains` pattern for a set of descriptions, or `null` when none long
 * enough to be specific survives.
 *
 * Taking the longest common substring of the normalised descriptors makes a
 * match against every source description true by construction: one
 * description yields its whole descriptor, several yield the part they share.
 * The result is re-checked with the real predicate anyway — construction
 * guarantees it, and running the check is what keeps the guarantee honest if
 * normalisation changes underneath. A pattern that matches none of the
 * descriptions it was derived from is exactly the bug, so it is refused
 * rather than returned.
 *
 * `siblingDescriptions` are other descriptions already known to belong to the
 * same merchant but left out of `descriptions` — typically because they carry
 * a different tag set, or none at all. A group of `AMZNPRIMEA*` renewals and a
 * group of `AMAZON RETA*` purchases share the same entity but are different
 * shapes of it; deriving from one group alone can still land on a fragment
 * short enough to also match the other (`A* AM` matched both in prod), which
 * would silently apply the first group's tags to the second's rows the next
 * time the rule runs. A pattern that reaches into a sibling is refused rather
 * than narrowed, for the same reason a too-short one is: a missing rule is
 * visible on the next import, an over-broad one is not (POPS-3665, POPS-3679).
 */
export function derivePatternFromDescriptions(
  descriptions: string[],
  siblingDescriptions: readonly string[] = []
): string | null {
  const pattern = longestCommonSubstring(descriptions.map(normalizeDescription)).trim();
  if (pattern.length < MIN_DERIVED_PATTERN_LENGTH) return null;
  if (lacksNonDigitContent(pattern)) return null;

  const matchesOwnRows = descriptions.some((description) =>
    patternMatchesDescription(pattern, 'contains', describeForMatching(description))
  );
  if (!matchesOwnRows) return null;

  const overreachesIntoSibling = siblingDescriptions.some((description) =>
    patternMatchesDescription(pattern, 'contains', describeForMatching(description))
  );
  return overreachesIntoSibling ? null : pattern;
}
