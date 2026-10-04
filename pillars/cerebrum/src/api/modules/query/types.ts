/**
 * Types for the cerebrum query engine.
 */

export type QueryDomain = 'engrams' | 'transactions' | 'media' | 'inventory';

/**
 * Query domains mapped to the `source_type` values their embeddings are stored
 * under. A domain can span several: media vectors are written as `movie` and
 * `tv_show`, never `media`.
 */
export const DOMAIN_SOURCE_TYPES: Record<QueryDomain, readonly string[]> = {
  engrams: ['engram'],
  transactions: ['transaction'],
  media: ['movie', 'tv_show'],
  inventory: ['inventory'],
};

/** Flatten query domains into the retrieval `sourceTypes` filter they select. */
export function sourceTypesForDomains(domains: readonly QueryDomain[]): string[] {
  return domains.flatMap((domain) => DOMAIN_SOURCE_TYPES[domain]);
}

export const ALL_QUERY_DOMAINS: QueryDomain[] = ['engrams', 'transactions', 'media', 'inventory'];

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface QueryRequest {
  question: string;
  scopes?: string[];
  includeSecret?: boolean;
  /** Maximum number of sources to retrieve (default 10). */
  maxSources?: number;
  /** Filter by domain. Omit or empty to search all. */
  domains?: QueryDomain[];
}

export interface QueryResponse {
  answer: string;
  sources: SourceCitation[];
  /** Scopes used for retrieval (explicit or inferred). */
  scopes: string[];
  confidence: ConfidenceLevel;
}

export interface SourceCitation {
  id: string;
  type: string;
  title: string;
  /** Truncated at a word boundary with ellipsis. */
  excerpt: string;
  /** Relevance score, normalized between zero and one. */
  relevance: number;
  /** Primary scope of the source. */
  scope: string;
}

export type ScopeInferenceSource = 'explicit' | 'inferred' | 'default';

export interface ScopeInferenceResult {
  scopes: string[];
  source: ScopeInferenceSource;
}

/** Internal result from the citation parser. */
export interface CitationParseResult {
  cleanedAnswer: string;
  citations: SourceCitation[];
}
