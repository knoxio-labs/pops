import { eq } from 'drizzle-orm';

import {
  CODE_PATTERN_KEY,
  CODE_PATTERN_RULE,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from '../../contract/settings/code-pattern.js';
import { inventoryKeyDefaults } from '../../contract/settings/key-defaults.js';
import { settings } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** One literal or type-letter segment of a code pattern. */
export type PatternPart = { kind: 'literal'; text: string } | { kind: 'type' };

/** Parsed inventory code pattern split around its numeric sequence. */
export interface CodePattern {
  readonly before: readonly PatternPart[];
  readonly width: number;
  readonly after: readonly PatternPart[];
}

function parseParts(value: string): PatternPart[] {
  const parts: PatternPart[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const typeIndex = value.indexOf('{type}', cursor);
    if (typeIndex === -1) {
      parts.push({ kind: 'literal', text: value.slice(cursor) });
      break;
    }
    if (typeIndex > cursor) parts.push({ kind: 'literal', text: value.slice(cursor, typeIndex) });
    parts.push({ kind: 'type' });
    cursor = typeIndex + '{type}'.length;
  }
  return parts;
}

/** Parse a stored code pattern, returning null when it fails the manifest rule. */
export function parseCodePattern(pattern: string): CodePattern | null {
  if (!new RegExp(CODE_PATTERN_RULE).test(pattern)) return null;
  const numberToken = /\{(#+)\}/.exec(pattern);
  const hashes = numberToken?.[1];
  if (!numberToken || numberToken.index === undefined || hashes === undefined) return null;
  return {
    before: parseParts(pattern.slice(0, numberToken.index)),
    width: hashes.length,
    after: parseParts(pattern.slice(numberToken.index + numberToken[0].length)),
  };
}

/** Render the pattern affixes with `{type}` replaced by the selected letter. */
export function renderAffixes(
  pattern: CodePattern,
  typeLetter: string
): { prefix: string; suffix: string } {
  const render = (parts: readonly PatternPart[]): string =>
    parts.map((part) => (part.kind === 'type' ? typeLetter : part.text)).join('');
  return { prefix: render(pattern.before), suffix: render(pattern.after) };
}

function settingValue(db: CommandDb, key: string): string {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? inventoryKeyDefaults.defaults[key] ?? '';
}

/** Read the persisted code-suggestion settings, applying manifest defaults. */
export function readCodeSettings(db: CommandDb): { suggest: boolean; pattern: string } {
  const storedPattern = settingValue(db, CODE_PATTERN_KEY);
  return {
    suggest: settingValue(db, SUGGEST_CODES_KEY) !== 'false',
    pattern: storedPattern || DEFAULT_CODE_PATTERN,
  };
}
