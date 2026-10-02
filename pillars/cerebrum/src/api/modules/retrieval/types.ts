/**
 * Internal retrieval types. The wire projection of these lives in
 * `src/contract/rest-retrieval-schemas.ts`; these are the service-layer shapes
 * the lifted search/context/structured services traffic in.
 */
export interface RetrievalResult {
  sourceType: string;
  sourceId: string;
  title: string;
  contentPreview: string;
  /**
   * A similarity in [0, 1]: cosine similarity for a hit the semantic leg found
   * (`semantic`, `both`, `similar`), BM25 relative to the query's best lexical
   * hit for a `lexical` hit, and 1 for a structured listing row.
   */
  score: number;
  /** L2 distance as sqlite-vec reported it; present on hits the semantic leg found. */
  distance?: number;
  /**
   * Which path found the hit: `lexical` and `semantic` are one retrieval leg
   * each, `both` is a source the two legs agreed on, `structured` is a filter
   * listing with no relevance ranking.
   */
  matchType: 'semantic' | 'lexical' | 'structured' | 'both';
  metadata: Record<string, unknown>;
}

export interface SourceAttribution {
  sourceType: string;
  sourceId: string;
  title: string;
  relevanceScore: number;
  chunkRange?: [number, number];
}

export interface RetrievalFilters {
  types?: string[];
  scopes?: string[];
  tags?: string[];
  dateRange?: { from?: string; to?: string };
  status?: string[];
  sourceTypes?: string[];
  customFields?: Record<string, unknown>;
  includeSecret?: boolean;
}
