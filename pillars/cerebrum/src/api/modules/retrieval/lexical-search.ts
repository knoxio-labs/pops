/**
 * LexicalSearchService — the lexical leg: matches the words of a query against
 * engram title and body in the `engram_fts` FTS5 index and ranks with BM25.
 *
 * It needs no embedding client and no sqlite-vec, so it is the leg a deployment
 * without an embedding API key answers from.
 *
 * The index is tokenised with `porter unicode61 remove_diacritics 2`: Unicode
 * word splitting, accents folded so "migracao" finds "migração", and Porter
 * stemming so a question's "migration" finds a note's "migrated". A question
 * rarely repeats a note's exact inflection, and OR matching cannot bridge that
 * on its own.
 *
 * Title and body carry equal BM25 weight. The title is derived from the body's
 * first heading, so its words are already counted in both columns.
 *
 * Only engrams are indexed; cross-pillar sources reach hybrid results through
 * the semantic leg alone.
 */
import { and, eq, sql } from 'drizzle-orm';

import { engramIndex, engramSearchDocs } from '../../../db/index.js';
import { engramMetadata, fetchEngramJunctions, type EngramRow } from './engram-result.js';
import { buildMatchExpression } from './lexical-query.js';
import { buildStructuredConditions } from './structured-query-conditions.js';

import type { CerebrumDb } from '../../../db/index.js';
import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SNIPPET_TOKENS = 64;

interface LexicalRow {
  engram: EngramRow;
  /** `bm25()` as FTS5 reports it: negative, and lower is a better match. */
  bm25: number;
  snippet: string;
}

/**
 * A hit's BM25 as a share of the best hit's, in (0, 1]; the best hit of a query
 * is always 1. It says how a hit compares with the others the same query
 * found, not how well it matches in absolute terms.
 */
function relativeRelevance(bm25: number, bestBm25: number): number {
  if (bestBm25 === 0) return 1;
  return Math.min(1, Math.max(0, bm25 / bestBm25));
}

export class LexicalSearchService {
  constructor(private readonly db: CerebrumDb) {}

  /**
   * Engrams matching any search term of `query`, best BM25 first, constrained
   * by `filters`. `score` on each hit is its BM25 relative to the best hit.
   */
  search(query: string, filters: RetrievalFilters = {}, limit = DEFAULT_LIMIT): RetrievalResult[] {
    if (filters.sourceTypes && !filters.sourceTypes.includes('engram')) return [];
    const match = buildMatchExpression(query);
    if (!match) return [];

    const rows = this.matchRows(match, filters, Math.min(limit, MAX_LIMIT));
    const best = rows[0];
    if (!best) return [];

    const junctions = fetchEngramJunctions(
      this.db,
      rows.map((row) => row.engram.id)
    );
    return rows.map((row) => ({
      sourceType: 'engram',
      sourceId: row.engram.id,
      title: row.engram.title,
      contentPreview: row.snippet,
      score: relativeRelevance(row.bm25, best.bm25),
      matchType: 'lexical' as const,
      metadata: engramMetadata(row.engram, junctions),
    }));
  }

  private matchRows(match: string, filters: RetrievalFilters, limit: number): LexicalRow[] {
    return this.db
      .select({
        engram: engramIndex,
        bm25: sql<number>`bm25(engram_fts)`,
        snippet: sql<string>`snippet(engram_fts, 1, '', '', '…', ${SNIPPET_TOKENS})`,
      })
      .from(engramIndex)
      .innerJoin(engramSearchDocs, eq(engramSearchDocs.engramId, engramIndex.id))
      .innerJoin(sql`engram_fts`, sql`engram_fts.rowid = ${engramSearchDocs.docid}`)
      .where(and(sql`engram_fts match ${match}`, ...buildStructuredConditions(filters)))
      .orderBy(sql`bm25(engram_fts)`)
      .limit(limit)
      .all();
  }
}
