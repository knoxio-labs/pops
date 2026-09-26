import { and, asc, desc, getTableColumns, isNull, or, sql } from 'drizzle-orm';

import { locations, type LocationRow } from '../../db/index.js';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { CommandDb } from '../../domain/commands/index.js';

/** A live location hit from the web-search surface. */
export type WebSearchPlaceHit = { row: LocationRow; tier: 'prefix' | 'contains' };

const WORD_SEPARATORS = [' ', '\t', '\n', '\r', '\v', '\f'];

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/gu, (character) => `\\${character}`);
const anyOf = (conditions: readonly SQL[]): SQL => or(...conditions) ?? sql`0`;
const like = (expression: SQLWrapper, pattern: string): SQL =>
  sql`lower(${expression}) LIKE lower(${pattern}) ESCAPE '\\'`;
const wordPrefix = (expression: SQLWrapper, escaped: string): SQL =>
  anyOf(WORD_SEPARATORS.map((separator) => like(expression, `%${separator}${escaped}%`)));

/** Read live locations matching a web-search query, ordered by match tier. */
export function readWebSearchPlaces(
  db: CommandDb,
  q: string,
  typeKey: string | null
): WebSearchPlaceHit[] {
  if (typeKey !== null) return [];
  const escaped = escapeLike(q);
  const prefix = anyOf([like(locations.name, `${escaped}%`), wordPrefix(locations.name, escaped)]);
  const tier = sql<'prefix' | 'contains'>`CASE WHEN ${prefix} THEN 'prefix' ELSE 'contains' END`;
  const rows = db
    .select({ ...getTableColumns(locations), tier })
    .from(locations)
    .where(and(isNull(locations.deletedAt), like(locations.name, `%${escaped}%`)))
    .orderBy(
      desc(sql`CASE WHEN ${prefix} THEN 1 ELSE 0 END`),
      asc(sql`${locations.name} COLLATE NOCASE`),
      asc(locations.id)
    )
    .all();
  return rows.map(({ tier: rowTier, ...row }) => ({ row, tier: rowTier }));
}
