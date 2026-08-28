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

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

/** Length of the escape sequence starting at `pattern[index]` (a backslash). */
function escapeLength(pattern: string, index: number): number {
  const kind = pattern[index + 1];
  if (kind === 'x') return 4;
  if (kind === 'c') return 3;
  if (kind === 'u' || kind === 'p' || kind === 'P') {
    if (pattern[index + 2] !== '{') return kind === 'u' ? 6 : 2;
    const close = pattern.indexOf('}', index + 3);
    return close === -1 ? pattern.length - index : close - index + 1;
  }
  return 2;
}

/** Length of a `{m}` / `{m,}` / `{m,n}` quantifier at `index`, or 0 if it isn't one. */
function quantifierLength(pattern: string, index: number): number {
  const close = pattern.indexOf('}', index + 1);
  if (close === -1) return 0;
  const body = pattern.slice(index + 1, close);
  return /^\d+(,\d*)?$/.test(body) ? close - index + 1 : 0;
}

interface ClassScan {
  length: number;
  expectsDigits: boolean;
}

/** Scan the character class starting at `pattern[index]` (a `[`). */
function scanCharacterClass(pattern: string, index: number): ClassScan {
  let cursor = index + 1;
  const negated = pattern[cursor] === '^';
  if (negated) cursor += 1;

  let expectsDigits = false;
  while (cursor < pattern.length && pattern[cursor] !== ']') {
    if (pattern[cursor] === '\\') {
      if (pattern[cursor + 1] === 'd') expectsDigits = true;
      cursor += escapeLength(pattern, cursor);
      continue;
    }
    if (isDigit(pattern[cursor])) expectsDigits = true;
    cursor += 1;
  }
  return {
    length: cursor >= pattern.length ? pattern.length - index : cursor - index + 1,
    expectsDigits: expectsDigits && !negated,
  };
}

/**
 * Does `pattern` contain a construct that can only be satisfied by a digit in
 * the subject — `\d`, a literal digit, or a character class holding either?
 *
 * Descriptions reach {@link patternMatchesNormalizedDescription} already
 * digit-stripped by {@link normalizeDescription}, so such a construct is dead:
 * a rule whose match depends on it can never fire, silently (POPS-2622). This
 * is the signal an authoring surface shows next to a zero-match preview; it is
 * deliberately not an error, because the digit construct may sit in an
 * alternation branch that does not gate the match.
 *
 * Quantifier digits (`A{2,3}`), negated classes (`[^0-9]`, which matches
 * fine), `\D`, and digits inside `\xHH` / `\uHHHH` / `\p{...}` escapes are not
 * digit expectations and do not trigger it.
 */
export function regexPatternExpectsDigits(pattern: string): boolean {
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '\\') {
      if (pattern[index + 1] === 'd') return true;
      index += escapeLength(pattern, index);
      continue;
    }
    if (char === '[') {
      const scan = scanCharacterClass(pattern, index);
      if (scan.expectsDigits) return true;
      index += scan.length;
      continue;
    }
    if (char === '{') {
      const quantifier = quantifierLength(pattern, index);
      if (quantifier > 0) {
        index += quantifier;
        continue;
      }
    }
    if (isDigit(char)) return true;
    index += 1;
  }
  return false;
}
