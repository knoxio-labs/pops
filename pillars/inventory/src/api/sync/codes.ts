import { isNotNull, sql } from 'drizzle-orm';

import { resolvePublishedType } from '../../catalogue/index.js';
import { DEFAULT_CODE_PATTERN } from '../../contract/settings/code-pattern.js';
import { items } from '../../db/index.js';
import { parseCodePattern, readCodeSettings, renderAffixes } from './code-pattern.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { CodePattern } from './code-pattern.js';

/** How many codes one suggestion request offers. */
export const SUGGESTION_COUNT = 3;
const EXPLICIT_STEM_MIN_WIDTH = 3;
const TRAILING_NUMBER = /^(.*?)(\d+)$/;

/** What a code suggestion is for. */
export interface SuggestRequest {
  readonly name: string;
  readonly typeKey?: string;
  readonly stem?: string;
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

function firstLetter(text: string): string | undefined {
  return /[A-Za-z]/.exec(text)?.[0]?.toUpperCase();
}

function suggestionsFromStem(db: CommandDb, stem: string): string[] {
  const rows = db
    .select({ code: items.code })
    .from(items)
    .where(sql`${items.code} LIKE ${`${escapeLike(stem)}%`} ESCAPE '\\'`)
    .all();

  let highest = 0;
  let width = EXPLICIT_STEM_MIN_WIDTH;
  for (const { code } of rows) {
    const match = code === null ? null : TRAILING_NUMBER.exec(code);
    const digits = match?.[2];
    if (match?.[1]?.toLowerCase() !== stem.toLowerCase() || digits === undefined) continue;
    const number = Number.parseInt(digits, 10);
    if (number >= highest) {
      highest = number;
      width = Math.max(EXPLICIT_STEM_MIN_WIDTH, digits.length);
    }
  }

  return Array.from(
    { length: SUGGESTION_COUNT },
    (_, index) => `${stem}${String(highest + 1 + index).padStart(width, '0')}`
  );
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function typeLetterFor(db: CommandDb, typeKey: string | undefined): string {
  const type = typeKey === undefined ? null : resolvePublishedType(db, { key: typeKey });
  return firstLetter(type?.label ?? '') ?? 'X';
}

function suggestionsFromPattern(db: CommandDb, pattern: CodePattern, typeLetter: string): string[] {
  const { prefix, suffix } = renderAffixes(pattern, typeLetter);
  const matcher = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`, 'i');
  const rows = db.select({ code: items.code }).from(items).where(isNotNull(items.code)).all();

  let highest = 0;
  const width = pattern.width;
  for (const { code } of rows) {
    const match = code === null ? null : matcher.exec(code);
    const digits = match?.[1];
    if (digits === undefined) continue;
    const number = Number.parseInt(digits, 10);
    if (number >= highest) {
      highest = number;
    }
  }

  return Array.from({ length: SUGGESTION_COUNT }, (_, index) => {
    const number = String(highest + 1 + index).padStart(width, '0');
    return `${prefix}${number}${suffix}`;
  });
}

/**
 * Deterministic code suggestions. Explicit stems retain the legacy collision
 * repair behavior; otherwise the persisted inventory pattern controls the
 * prefix, suffix, width, and type-letter fallback.
 */
export function suggestCodes(db: CommandDb, request: SuggestRequest): string[] {
  const settings = readCodeSettings(db);
  if (!settings.suggest) return [];
  if (request.stem) return suggestionsFromStem(db, request.stem);

  const pattern = parseCodePattern(settings.pattern) ?? parseCodePattern(DEFAULT_CODE_PATTERN);
  if (pattern === null) throw new Error('default inventory code pattern is invalid');
  return suggestionsFromPattern(db, pattern, typeLetterFor(db, request.typeKey));
}
