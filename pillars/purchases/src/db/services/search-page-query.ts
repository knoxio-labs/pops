import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { PurchaseSearchScope } from './search-filters.js';

type SearchPageKind = 'purchases' | 'lines';

const SearchPageCursorSchema = z.object({
  version: z.literal(1),
  query: z.string(),
  adapter: z.enum(['purchases', 'lines']),
  score: z.union([z.literal(1), z.literal(0.8), z.literal(0.5)]),
  dateRank: z.number().nullable(),
  uri: z.string().min(1),
});

export type SearchPageCursor = z.infer<typeof SearchPageCursorSchema>;
export type SearchPageAdapter = SearchPageCursor['adapter'];

export interface SearchPageCandidate {
  readonly adapter: SearchPageAdapter;
  readonly candidate: import('./search-ranking.js').ScoredCandidate;
  readonly dateRank: number | null;
}

export interface SearchTextRank {
  readonly score: SQL<number>;
  readonly matches: SQL;
}

interface FieldMatches {
  readonly exact: SQL;
  readonly prefix: SQL;
  readonly contains: SQL;
}

/** Inputs shared by the order and line adapters for a bounded page. */
export interface SearchPageRequest {
  readonly text: string;
  readonly scope: PurchaseSearchScope;
  readonly cursor: SearchPageCursor | null;
  readonly limit: number;
}

interface SearchCursorBoundary {
  readonly adapter: SearchPageAdapter;
  readonly score: SQL<number>;
  readonly dateRank: SQL<number | null>;
  readonly uri: SQL<string>;
  readonly cursor: SearchPageCursor | null;
}

function fieldMatches(value: SQLWrapper, text: string): FieldMatches {
  const normalized = sql`pops_unicode_lower(${value})`;
  const needle = text.toLowerCase();
  return {
    exact: sql`${normalized} = ${needle}`,
    prefix: sql`substr(${normalized}, 1, length(${needle})) = ${needle}`,
    contains: sql`instr(${normalized}, ${needle}) > 0`,
  };
}

/** Build SQL scoring that follows the adapters' exact, prefix, contains order. */
export function searchTextRank(
  fields: readonly { readonly value: SQLWrapper }[],
  text: string
): SearchTextRank {
  const matches = fields.map(({ value }) => fieldMatches(value, text));
  const cases = [
    ...matches.map(({ exact }) => sql`WHEN ${exact} THEN 1.0`),
    ...matches.map(({ prefix }) => sql`WHEN ${prefix} THEN 0.8`),
    ...matches.map(({ contains }) => sql`WHEN ${contains} THEN 0.5`),
  ];
  const score = sql<number>`CASE ${sql.join(cases, sql` `)} ELSE 0 END`;
  return { score, matches: gt(score, 0) };
}

/** Compose the continuation predicate for the global adapter-stable rank. */
export function afterSearchCursor(boundary: SearchCursorBoundary): SQL | undefined {
  const { adapter, score, dateRank, uri, cursor } = boundary;
  if (cursor === null) return undefined;

  const lowerScore = lt(score, cursor.score);
  const equalScore = eq(score, cursor.score);
  if (adapter === 'purchases' && cursor.adapter === 'lines') return lowerScore;
  if (adapter === 'lines' && cursor.adapter === 'purchases') {
    return or(lowerScore, equalScore);
  }

  const afterSameAdapterRank =
    cursor.dateRank === null
      ? and(isNull(dateRank), gt(uri, cursor.uri))
      : or(
          isNull(dateRank),
          lt(dateRank, cursor.dateRank),
          and(eq(dateRank, cursor.dateRank), gt(uri, cursor.uri))
        );
  return or(lowerScore, and(equalScore, afterSameAdapterRank));
}

/** Order one adapter by score, parsed recency, then URI. */
export function searchRankOrderBy(
  score: SQL<number>,
  dateRank: SQL<number | null>,
  uri: SQL<string>
): readonly SQL[] {
  return [
    desc(score),
    desc(sql<number>`CASE WHEN ${dateRank} IS NULL THEN 0 ELSE 1 END`),
    desc(dateRank),
    asc(uri),
  ] as const;
}

/** Canonical request tuple the continuation token belongs to. */
export function searchPageQueryKey(
  normalizedText: string,
  scope: PurchaseSearchScope,
  kind?: SearchPageKind
): string {
  return JSON.stringify({
    text: normalizedText,
    kind: kind ?? null,
    sources: [...(scope.sources ?? [])].toSorted(),
    statuses: [...(scope.statuses ?? [])].toSorted(),
    tags: [...(scope.tags ?? [])].toSorted(),
    from: scope.from ?? null,
    to: scope.to ?? null,
  });
}

/** Decode a continuation token only for the same text, scope, and kind. */
export function decodeSearchPageCursor(encoded: string, query: string): SearchPageCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const cursor = SearchPageCursorSchema.safeParse(parsed);
  if (!cursor.success || cursor.data.query !== query) return null;
  return cursor.data;
}

/** Encode a ranked result tuple as an opaque continuation token. */
export function encodeSearchPageCursor(query: string, candidate: SearchPageCandidate): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      query,
      adapter: candidate.adapter,
      score: candidate.candidate.hit.score,
      dateRank: candidate.dateRank,
      uri: candidate.candidate.hit.uri,
    }),
    'utf8'
  ).toString('base64url');
}
