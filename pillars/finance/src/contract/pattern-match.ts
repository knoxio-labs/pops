/**
 * The single definition of "does this pattern match this description".
 *
 * Every entry point that answers that question — the corrections matcher, the
 * tag-rule matcher, the rule-match preview, the ChangeSet impact preview, the
 * retroactive apply — routes through {@link patternMatchesDescription} here.
 * Four independent implementations used to exist and disagreed on case
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
 *
 * This is the subject for `exact` and `contains` only. `regex` is matched
 * against the raw description — see {@link patternMatchesDescription}.
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

/** A transaction description in both of the forms the matcher needs. */
export interface MatchableDescription {
  /** The description exactly as it arrived. A `regex` pattern is tested against this. */
  readonly raw: string;
  /** {@link normalizeDescription} of `raw`. `exact` and `contains` are tested against this. */
  readonly normalized: string;
}

/** Pair a raw description with its normalised form for {@link patternMatchesDescription}. */
export function describeForMatching(raw: string): MatchableDescription {
  return { raw, normalized: normalizeDescription(raw) };
}

/**
 * Does `pattern`, interpreted per `matchType`, match `description`?
 *
 * The match type decides which representation the pattern is tested against,
 * and this is the only place that decision is made:
 *
 * - `exact` and `contains` test `description.normalized`. The pattern is
 *   normalised the same way it is on write (so a caller may pass either a
 *   stored pattern or a raw not-yet-persisted one), which is what lets one
 *   `WOOLWORTHS` pattern cover `WOOLWORTHS 1034 CANTERB` and
 *   `WOOLWORTHS 2201 NEWTOWN`.
 * - `regex` tests `description.raw`. Normalisation strips digits, so a regex
 *   run against it could never see one — `\d{4}` was inert by construction,
 *   which removed the only reason to choose `regex` over `contains`
 *   (POPS-2640). An author writing a regex is specifying the match precisely;
 *   they get the description the bank actually sent.
 *
 * Two consequences of `regex` seeing raw text, both deliberate and both tested:
 *
 * - The `i` flag is kept. It is now a real choice rather than compensation for
 *   an uppercased subject, and it is what authors expect of a rule editor.
 * - Diacritics are **not** folded. `CAFE` does not match `CAFÉ MOZART`;
 *   `CAF[EÉ]` does. Literal control means literal, and an author who wants
 *   folding can write the character class. `exact`/`contains` still fold,
 *   because their pattern is folded on both sides.
 *
 * An uncompilable regex yields `false` (warned once per distinct pattern)
 * rather than throwing, so one malformed row can't poison a whole match pass.
 * New rows are rejected at the API boundary; this guards rows written before
 * that validation existed.
 */
export function patternMatchesDescription(
  pattern: string,
  matchType: PatternMatchType,
  description: MatchableDescription
): boolean {
  if (pattern.length === 0) return false;
  if (matchType === 'regex') {
    try {
      return new RegExp(pattern, 'i').test(description.raw);
    } catch {
      warnOnceInvalidPattern(pattern);
      return false;
    }
  }
  const normalizedPattern = normalizeDescription(pattern);
  if (normalizedPattern.length === 0) return false;
  return matchType === 'exact'
    ? description.normalized === normalizedPattern
    : description.normalized.includes(normalizedPattern);
}
