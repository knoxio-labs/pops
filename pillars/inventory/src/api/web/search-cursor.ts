import { and, eq, gt, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { items } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type { SQL } from 'drizzle-orm';

/** The item tiers encoded in a web-search cursor. */
export type WebSearchTier = 'prefix' | 'contains' | 'other';

/** The normalized query values bound to a web-search cursor. */
export interface WebSearchCursorQuery {
  readonly q: string;
  readonly activeOnly: boolean;
  readonly typeKey: string | null;
  readonly within: string | null;
}

/** The item sort key used to issue a web-search cursor. */
export interface WebSearchCursorHit {
  readonly id: string;
  readonly lifecycle: string;
  readonly name: string;
  readonly tier: WebSearchTier;
}

const cursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-search'),
  q: z.string(),
  activeOnly: z.boolean(),
  typeKey: z.string().nullable(),
  within: z.string().nullable(),
  key: z.tuple([z.number().int().min(1).max(3), z.union([z.literal(0), z.literal(1)]), z.string()]),
  after: z.string(),
});

/** The validated state carried by a web-search cursor. */
export type WebSearchCursor = z.infer<typeof cursorSchema>;

/** Decode and validate a cursor against the query that issued it. */
export function readWebSearchCursor(
  raw: string | undefined,
  query: WebSearchCursorQuery
): WebSearchCursor | null {
  if (raw === undefined) return null;
  try {
    const cursor = decodeCursor(cursorSchema, raw);
    const sameQuery =
      cursor.q !== query.q ||
      cursor.activeOnly !== query.activeOnly ||
      cursor.typeKey !== query.typeKey ||
      cursor.within !== query.within;
    if (sameQuery) throw new Error('cursor query mismatch');
    return cursor;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor: raw });
  }
}

/** Build the keyset predicate after a web-search cursor. */
export function webSearchAfterCursor(
  cursor: WebSearchCursor | null,
  rank: SQL<number>,
  active: SQL<number>
): SQL | undefined {
  if (cursor === null) return undefined;
  const [tier, activeValue, name] = cursor.key;
  const sameRank = eq(rank, tier);
  const sameActive = eq(active, activeValue);
  const nameKey = sql`${items.name} COLLATE NOCASE`;
  return (
    or(
      sql`${rank} < ${tier}`,
      and(sameRank, sql`${active} > ${activeValue}`),
      and(sameRank, sameActive, sql`${nameKey} > ${name}`),
      and(sameRank, sameActive, sql`${nameKey} = ${name}`, gt(items.id, cursor.after))
    ) ?? sql`0`
  );
}

/** Encode the final item sort key as the next web-search cursor. */
export function webSearchNextCursor(query: WebSearchCursorQuery, hit: WebSearchCursorHit): string {
  const tier = { prefix: 3, contains: 2, other: 1 }[hit.tier];
  return encodeCursor({
    v: 1,
    t: 'web-search',
    q: query.q,
    activeOnly: query.activeOnly,
    typeKey: query.typeKey,
    within: query.within,
    key: [tier, hit.lifecycle === 'active' ? 0 : 1, hit.name],
    after: hit.id,
  });
}
