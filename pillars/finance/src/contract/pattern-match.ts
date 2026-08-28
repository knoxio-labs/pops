/**
 * The single definition of "does this pattern match this description".
 *
 * Every entry point that answers that question — the corrections matcher, the
 * tag-rule matcher, the rule-match preview, the ChangeSet impact preview, the
 * retroactive apply — routes through {@link patternMatchesNormalizedDescription}
 * here. Four independent implementations used to exist and disagreed on case
 * folding, digit stripping and the regex `i` flag, so the same rule could
 * classify a row and contribute no tags (POPS-2600).
 *
 * Dependency-free and browser-safe: `app-finance`'s optimistic merge bundles
 * this alongside the server.
 */

/** How a `descriptionPattern` is interpreted against an incoming description. */
export type PatternMatchType = 'exact' | 'contains' | 'regex';

/**
 * Canonicalise a transaction description for matching: fold diacritics, treat
 * hyphens as a space and strip ampersands/periods, uppercase, strip digits,
 * collapse whitespace. The entity-matcher's `normalizeKey` folds diacritics
 * and punctuation the same way.
 *
 * Idempotent: normalising an already-normalised string is a no-op, which is
 * what lets the matcher normalise a stored (already-normalised) pattern
 * without changing it.
 */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/-/g, ' ')
    .replaceAll(/[&.]/g, '')
    .toUpperCase()
    .replaceAll(/\d+/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/** Does `pattern` compile as a JavaScript regular expression? */
export function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}

/**
 * The form a pattern is persisted in, given its match type.
 *
 * `exact`/`contains` patterns are matched against a normalised description and
 * are normalised on write so they line up. A `regex` pattern is stored
 * verbatim: {@link normalizeDescription} uppercases every character including
 * metacharacters (`\d` -> `\D`, `\s` -> `\S`), strips digits (`a{2,3}` ->
 * `a{,}`) and deletes `.`, which silently corrupts the pattern.
 */
export function normalizePatternForStorage(pattern: string, matchType: PatternMatchType): string {
  return matchType === 'regex' ? pattern : normalizeDescription(pattern);
}

const warnedInvalidPatterns = new Set<string>();

function warnOnceInvalidPattern(pattern: string): void {
  if (warnedInvalidPatterns.has(pattern)) return;
  warnedInvalidPatterns.add(pattern);
  console.warn(`[pattern-match] invalid regex pattern — rule can never match: ${pattern}`);
}

/**
 * Does `pattern`, interpreted per `matchType`, match a pre-normalised
 * description?
 *
 * `normalizedDescription` MUST be the output of {@link normalizeDescription}.
 * The pattern is normalised the same way it is on write (so a caller may pass
 * either a stored pattern or a raw not-yet-persisted one), except for `regex`,
 * which is used verbatim and always matched case-insensitively — the stored
 * pattern is raw while the description is uppercased, so the `i` flag is what
 * makes a lowercase literal reachable at all.
 *
 * An uncompilable regex yields `false` (warned once per distinct pattern)
 * rather than throwing, so one malformed row can't poison a whole match pass.
 * New rows are rejected at the API boundary; this guards rows written before
 * that validation existed.
 */
export function patternMatchesNormalizedDescription(
  pattern: string,
  matchType: PatternMatchType,
  normalizedDescription: string
): boolean {
  if (pattern.length === 0) return false;
  if (matchType === 'regex') {
    try {
      return new RegExp(pattern, 'i').test(normalizedDescription);
    } catch {
      warnOnceInvalidPattern(pattern);
      return false;
    }
  }
  const normalizedPattern = normalizeDescription(pattern);
  if (normalizedPattern.length === 0) return false;
  return matchType === 'exact'
    ? normalizedDescription === normalizedPattern
    : normalizedDescription.includes(normalizedPattern);
}
