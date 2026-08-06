/**
 * `purchase_sources.descriptorPattern` matching — stage 0 blocking.
 *
 * The column's format was never written down, and the repo disagreed with
 * itself about it: the source fixtures store SQL-LIKE patterns (`AMAZON%`,
 * `BUNNINGS%`) while the Amazon ingest CLI registered a bare `AMAZON`.
 * Under substring matching the first never matches anything; under LIKE the
 * second matches only a descriptor that is exactly `AMAZON`. Either way one
 * of them silently blocks every candidate and sends the source's whole
 * backlog to review.
 *
 * **The format is LIKE**, which is what the stored data already assumes:
 *
 * - `%` matches any run of characters, including none
 * - `_` matches exactly one character
 * - everything else is literal, and matching is case-insensitive
 * - the pattern is anchored, so `AMAZON` means the whole descriptor
 *
 * Note what that implies: a pattern with no wildcard is an equality test.
 * `AMAZON%` is almost always what a source wants, and the CLI was corrected
 * to write it.
 */

const LIKE_SPECIAL = /[%_]/u;

/** Characters that must not be interpreted as regex syntax. */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

/**
 * Compile a LIKE pattern to an anchored, case-insensitive regex.
 *
 * Escaping happens before the wildcards are substituted, so a descriptor
 * containing regex syntax — `PAYPAL *SOMEONE` is a real bank descriptor —
 * is matched literally rather than being read as a quantifier.
 */
export function compileDescriptorPattern(pattern: string): RegExp {
  const escaped = pattern.replaceAll(REGEX_SPECIAL, '\\$&');
  const body = escaped.replaceAll('%', '.*').replaceAll('_', '.');
  return new RegExp(`^${body}$`, 'iu');
}

/** Matches every descriptor. What a source with no declared pattern gets. */
const MATCH_EVERYTHING: DescriptorMatcher = () => true;

export type DescriptorMatcher = (descriptor: string) => boolean;

/**
 * Compile a source's pattern once, for reuse across a charge's candidates.
 *
 * Compiling per candidate re-escapes and re-parses the same pattern for
 * every transaction in the window. Hoisting it is why this returns a
 * matcher rather than taking the descriptor: the alternative — a
 * module-level regex cache — would put unbounded mutable state in a module
 * the solver relies on being pure.
 *
 * A null or empty pattern blocks nothing. The source has simply not
 * declared one, which is different from declaring one that matches nothing.
 */
export function descriptorMatcherFor(pattern: string | null): DescriptorMatcher {
  if (pattern === null || pattern.trim() === '') return MATCH_EVERYTHING;
  const compiled = compileDescriptorPattern(pattern);
  return (descriptor) => compiled.test(descriptor);
}

/** One-shot convenience over {@link descriptorMatcherFor}. */
export function descriptorMatches(descriptor: string, pattern: string | null): boolean {
  return descriptorMatcherFor(pattern)(descriptor);
}

/** True when a pattern contains a wildcard, i.e. is not an equality test. */
export function hasWildcard(pattern: string): boolean {
  return LIKE_SPECIAL.test(pattern);
}
