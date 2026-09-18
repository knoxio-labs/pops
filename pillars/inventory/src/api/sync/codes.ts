import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { items } from '../../db/index.js';
import { findType } from '../../types/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** How many codes one suggestion request offers. */
export const SUGGESTION_COUNT = 3;
const MIN_WIDTH = 3;
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

/** The stem most codes of `typeKey`'s live items already use, ties broken alphabetically. */
function commonStemOfType(db: CommandDb, typeKey: string): string | undefined {
  const rows = db
    .select({ code: items.code })
    .from(items)
    .where(and(eq(items.typeKey, typeKey), isNotNull(items.code), isNull(items.deletedAt)))
    .all();
  const tally = new Map<string, number>();
  for (const { code } of rows) {
    const stem = code === null ? undefined : TRAILING_NUMBER.exec(code)?.[1];
    if (stem) tally.set(stem.toUpperCase(), (tally.get(stem.toUpperCase()) ?? 0) + 1);
  }
  const ranked = [...tally].toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return ranked[0]?.[0];
}

/**
 * The stem to number from: the one asked for; else the stem the type's items
 * already share; else the first letter of the type's name, then of the item's
 * name; else `X`.
 */
function chooseStem(db: CommandDb, request: SuggestRequest): string {
  if (request.stem) return request.stem;
  const type = request.typeKey === undefined ? undefined : findType(request.typeKey);
  const shared = type ? commonStemOfType(db, type.key) : undefined;
  return shared ?? firstLetter(type?.name ?? '') ?? firstLetter(request.name) ?? 'X';
}

/**
 * Deterministic code suggestions (Inventory ADR-002 D7, Phase A): the chosen stem
 * followed by the next numbers above the highest one any item, tombstones
 * included, already carries with that stem, zero-padded to at least three
 * digits. Every code with that stem is at or below the highest, so none is
 * held. A tombstoned item keeps its code under the unique index, so it counts
 * too. Suggestions never rewrite anything.
 */
export function suggestCodes(db: CommandDb, request: SuggestRequest): string[] {
  const stem = chooseStem(db, request);
  const rows = db
    .select({ code: items.code })
    .from(items)
    .where(sql`${items.code} LIKE ${`${escapeLike(stem)}%`} ESCAPE '\\'`)
    .all();

  let highest = 0;
  let width = MIN_WIDTH;
  for (const { code } of rows) {
    const match = code === null ? null : TRAILING_NUMBER.exec(code);
    const digits = match?.[2];
    if (match?.[1]?.toLowerCase() !== stem.toLowerCase() || digits === undefined) continue;
    const number = Number.parseInt(digits, 10);
    if (number >= highest) {
      highest = number;
      width = Math.max(MIN_WIDTH, digits.length);
    }
  }

  return Array.from(
    { length: SUGGESTION_COUNT },
    (_, index) => `${stem}${String(highest + 1 + index).padStart(width, '0')}`
  );
}
