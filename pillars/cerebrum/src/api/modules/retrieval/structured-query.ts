/**
 * StructuredQueryService — lists `engram_index` rows matching the filters,
 * newest first, on the pillar drizzle handle. It never sees query text, so the
 * order says nothing about relevance. Returns `RetrievalResult[]` with
 * `matchType: 'structured'`.
 */
import { and, desc } from 'drizzle-orm';

import { engramIndex } from '../../../db/index.js';
import { engramMetadata, fetchEmbeddingPreviews, fetchEngramJunctions } from './engram-result.js';
import { buildStructuredConditions } from './structured-query-conditions.js';

import type { CerebrumDb } from '../../../db/index.js';
import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class StructuredQueryService {
  constructor(private readonly db: CerebrumDb) {}

  query(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    if (filters.sourceTypes && !filters.sourceTypes.includes('engram')) return [];

    const cappedLimit = Math.min(limit, MAX_LIMIT);
    const conditions = buildStructuredConditions(filters);

    const rows = this.db
      .select()
      .from(engramIndex)
      .where(and(...conditions))
      .orderBy(desc(engramIndex.modifiedAt))
      .limit(cappedLimit)
      .offset(offset)
      .all();

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const junctions = fetchEngramJunctions(this.db, ids);
    const previews = fetchEmbeddingPreviews(this.db, ids);
    return rows.map((row) => ({
      sourceType: 'engram',
      sourceId: row.id,
      title: row.title,
      contentPreview: previews.get(row.id) ?? '',
      score: 1,
      matchType: 'structured' as const,
      metadata: engramMetadata(row, junctions),
    }));
  }
}
