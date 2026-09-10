/**
 * Shared scanner for reading this repo's own TypeScript object literals from
 * source text, without a parser.
 *
 * Tier A guards may not import a third-party module (ADR-045), so the guards
 * that need to read a `navConfig`, a `routes` table or a wire manifest read
 * the source as text. Getting that right is subtle — a lone apostrophe in a
 * comment desynchronises a naive quote scanner, and a nested array leaks its
 * keys into the parent object — and the ADR records that copying a
 * hand-rolled matcher between guards is how the same defect spreads. So the
 * subtle half lives here once, and each guard keeps only the part that is
 * about its own question.
 */

/**
 * Walk `text` from `fromIndex`, yielding only the characters that are real
 * code: everything inside a `'`/`"`/`` ` `` string literal, a `//` line
 * comment or a `/* *\/` block comment is consumed and skipped. Comments have
 * to be skipped BEFORE quotes are honoured, or a lone apostrophe in prose
 * (`the Ingredients tab's detail panel`) opens a string state that never
 * closes and desynchronises every caller downstream of it.
 *
 * @param {string} text
 * @param {number} [fromIndex]
 * @returns {Generator<{ index: number; ch: string }>}
 */
export function* scanCode(text, fromIndex = 0) {
  /** @type {string | null} */
  let quote = null;
  /** @type {'line' | 'block' | null} */
  let comment = null;
  for (let i = fromIndex; i < text.length; i++) {
    const ch = text.charAt(i);
    if (comment === 'line') {
      if (ch === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (ch === '*' && text.charAt(i + 1) === '/') {
        i++;
        comment = null;
      }
      continue;
    }
    if (quote !== null) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && text.charAt(i + 1) === '/') {
      comment = 'line';
      i++;
      continue;
    }
    if (ch === '/' && text.charAt(i + 1) === '*') {
      comment = 'block';
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    yield { index: i, ch };
  }
}

/**
 * Extract the balanced-bracket span starting at the first `open` character
 * found at or after `fromIndex` that is neither in a string nor in a comment.
 * Returns the substring INCLUDING both delimiters, or undefined if `open`
 * never appears or never balances.
 *
 * @param {string} text
 * @param {number} fromIndex
 * @param {string} open
 * @param {string} close
 * @returns {string | undefined}
 */
export function balancedSpan(text, fromIndex, open, close) {
  let start = -1;
  let depth = 0;
  for (const { index, ch } of scanCode(text, fromIndex)) {
    if (start === -1) {
      if (ch !== open) continue;
      start = index;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

/**
 * Split a balanced `[ ... ]` array's TOP-LEVEL `{ ... }` object entries —
 * nested objects (e.g. a route's `children`) are not split out separately.
 * @param {string} arraySpan Including the outer `[` `]`.
 * @returns {string[]}
 */
export function topLevelObjects(arraySpan) {
  /** @type {string[]} */
  const objects = [];
  let i = 0;
  while (i < arraySpan.length) {
    if (arraySpan[i] === '{') {
      const span = balancedSpan(arraySpan, i, '{', '}');
      if (span === undefined) break;
      objects.push(span);
      i += span.length;
      continue;
    }
    i++;
  }
  return objects;
}

/**
 * Split a balanced `{ ... }` object's OWN top-level `key: value` entries —
 * a route object's `children: [ { index: true, ... }, ... ]` never leaks its
 * `index`/`path`/`element` keys up into the parent's map, because those keys
 * live inside a nested array this never descends into.
 * @param {string} objectSpan Including the outer `{` `}`.
 * @returns {Map<string, string>}
 */
export function topLevelProperties(objectSpan) {
  const inner = objectSpan.slice(1, -1);
  /** @type {Map<string, string>} */
  const props = new Map();
  let depth = 0;
  let entryStart = 0;
  /** @param {number} end */
  const flush = (end) => {
    const entry = inner
      .slice(entryStart, end)
      .replace(/^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*/, '');
    const keyMatch = /^\s*(\w+)\s*:\s*/.exec(entry);
    const key = keyMatch === null ? undefined : keyMatch[1];
    if (keyMatch !== null && key !== undefined) {
      props.set(key, entry.slice(keyMatch[0].length).trim());
    }
  };
  for (const { index, ch } of scanCode(inner)) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      flush(index);
      entryStart = index + 1;
    }
  }
  flush(inner.length);
  return props;
}
