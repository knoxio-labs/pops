/**
 * Getting a JSON object back out of whatever a model actually returned.
 *
 * Models emit JSON wrapped in prose or a fenced block often enough that
 * refusing it would mean discarding good answers over punctuation. The
 * unwrapping is deliberately narrow: the first balanced `{…}` span,
 * ignoring braces inside strings. It is not a repair pass — malformed JSON
 * inside the braces still fails, loudly.
 *
 * Shared by the receipt reader and the item-kind proposer, because two
 * copies of this would drift and only one of them would be tested.
 */
export function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString && char === '{') {
      depth += 1;
    } else if (!inString && char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
