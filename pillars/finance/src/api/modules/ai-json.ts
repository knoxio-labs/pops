/**
 * Shared prose-tolerant JSON extraction for finance's Claude callers.
 *
 * Every parser that turns a Claude text reply into structured data needs the
 * same two steps: strip markdown code fences, then pull out the first
 * balanced JSON value even if the model wrapped it in an explanatory
 * sentence. Originally added to the categorizer only (#3591); every other
 * Claude-response parser in the corrections cluster hand-rolled the same
 * bare `JSON.parse(stripFences(text))`, one stray sentence away from the
 * same "AI returned invalid JSON" failure. This module is the single place
 * that logic lives now.
 */

export function stripCodeFences(text: string): string {
  return text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
}

/**
 * Extract the first balanced top-level JSON value (object or array) from
 * `text`, tolerating prose the model may add before or after it — Haiku
 * sometimes pretty-prints the value and then appends an explanatory
 * sentence, which naive whole-string `JSON.parse` rejects ("Unexpected
 * non-whitespace character after JSON"). String literals are respected so
 * braces/brackets inside values don't unbalance the scan. Returns null when
 * no complete value is present.
 */
export function extractFirstJsonValue(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Convenience: strip code fences, then extract the first balanced JSON value. */
export function extractJsonFromReply(text: string): string | null {
  return extractFirstJsonValue(stripCodeFences(text));
}
