/**
 * The code suggestion pattern: literal letters, digits and hyphens, the
 * type's letter as `{type}`, and one run of `#` inside braces for the
 * number, where the count of `#` is the minimum width (`{##}` gives 07, then
 * 10, then 100). A code has to fit the small label, so a rendered code is at
 * most ten characters.
 */

/** One piece of a parsed pattern. */
export type PatternPart =
  | { kind: 'text'; text: string }
  | { kind: 'type' }
  | { kind: 'number'; width: number };

/** A parsed pattern, or the one thing wrong with it. */
export type PatternResult = { ok: true; parts: PatternPart[] } | { ok: false; error: string };

/** The longest code the small label prints legibly. */
export const MAX_CODE_LENGTH = 10;

const TOKEN = /\{([^{}]*)\}/gu;

function tokenPart(body: string): PatternPart | string {
  if (body.toLowerCase() === 'type') return { kind: 'type' };
  if (/^#{1,6}$/u.test(body)) return { kind: 'number', width: body.length };
  return `Unknown part {${body}}. Use {type} or {#}.`;
}

function textError(text: string): string | null {
  if (/[{}]/u.test(text)) return 'A brace is not closed.';
  return /^[A-Za-z0-9-]*$/u.test(text) ? null : 'Use only letters, digits and hyphens.';
}

/** Parses a pattern. */
export function parsePattern(pattern: string): PatternResult {
  if (pattern.trim() === '')
    return { ok: false, error: 'Enter a pattern, or turn suggestions off.' };
  const parts: PatternPart[] = [];
  let cursor = 0;
  for (const match of pattern.matchAll(TOKEN)) {
    const text = pattern.slice(cursor, match.index);
    const problem = textError(text);
    if (problem !== null) return { ok: false, error: problem };
    if (text !== '') parts.push({ kind: 'text', text: text.toUpperCase() });
    const part = tokenPart(match[1] ?? '');
    if (typeof part === 'string') return { ok: false, error: part };
    parts.push(part);
    cursor = match.index + match[0].length;
  }
  const tail = pattern.slice(cursor);
  const problem = textError(tail);
  if (problem !== null) return { ok: false, error: problem };
  if (tail !== '') parts.push({ kind: 'text', text: tail.toUpperCase() });
  const numbers = parts.filter((part) => part.kind === 'number').length;
  if (numbers === 0) return { ok: false, error: 'Add {#} so each code gets its own number.' };
  if (numbers > 1) return { ok: false, error: 'Use one number, not several.' };
  return { ok: true, parts };
}

/** The letter a type contributes: its first letter, or X for an untyped item. */
export function typeLetter(typeName: string | null): string {
  const letter = typeName?.match(/[A-Za-z]/u)?.[0];
  return letter === undefined ? 'X' : letter.toUpperCase();
}

/** Renders one code from parsed parts. */
export function renderCode(
  parts: readonly PatternPart[],
  typeName: string | null,
  next: number
): string {
  return parts
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'type') return typeLetter(typeName);
      return String(next).padStart(part.width, '0');
    })
    .join('');
}

/** A sample the preview renders: a type and the next free number for it. */
export interface CodeSample {
  typeName: string | null;
  next: number;
}

/** What a pattern would suggest for each sample, or why it cannot. */
export function previewCodes(
  pattern: string,
  samples: readonly CodeSample[]
): { ok: true; codes: string[] } | { ok: false; error: string } {
  const parsed = parsePattern(pattern);
  if (!parsed.ok) return parsed;
  const codes = samples.map((sample) => renderCode(parsed.parts, sample.typeName, sample.next));
  const long = codes.find((code) => code.length > MAX_CODE_LENGTH);
  if (long !== undefined) {
    return {
      ok: false,
      error: `${long} is ${long.length} characters; labels fit ${MAX_CODE_LENGTH}.`,
    };
  }
  return { ok: true, codes };
}
