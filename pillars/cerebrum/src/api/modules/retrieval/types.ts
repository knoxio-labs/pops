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
   * Cosine similarity for a semantic or `similar` hit, the fused RRF score for
   * a hybrid hit, and 1 for a structured listing row.
   */
  score: number;
  /** L2 distance as sqlite-vec reported it; present on hits the semantic leg found. */
  distance?: number;
  matchType: 'semantic' | 'structured' | 'both';
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
