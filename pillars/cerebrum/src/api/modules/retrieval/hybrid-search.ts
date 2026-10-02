/**
 * HybridSearchService — query-ranked retrieval behind the `search` / `context`
 * / `similar` handlers and the query, emit and ego services.
 *
 * The semantic leg is the only leg, so nothing is fused and a hit's `score` is
 * its cosine similarity. {@link StructuredQueryService} lists engrams by
 * filter, newest first; it never sees the query text, so it is not a relevance
 * signal. Filters constrain the candidate set instead.
 *
 * The semantic leg is best-effort. A missing embedding client, a
 * vec-unavailable database, or a provider error all collapse it to an empty
 * list (logged), and `hybrid` then returns nothing.
 *
 * Thresholds are minimum cosine similarity; see `cosine.ts`.
 */
import { DEFAULT_SEARCH_MIN_COSINE, DEFAULT_SIMILAR_MIN_COSINE } from './cosine.js';
import { SemanticSearchService, type SemanticSearchDeps } from './semantic-search.js';
import { StructuredQueryService } from './structured-query.js';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export class HybridSearchService {
  private readonly semanticSvc: SemanticSearchService;
  private readonly structuredSvc: StructuredQueryService;

  constructor(deps: SemanticSearchDeps) {
    this.semanticSvc = new SemanticSearchService(deps);
    this.structuredSvc = new StructuredQueryService(deps.db);
  }

  /** Rank `query` against the corpus; `score` on each hit is its cosine similarity to `query`. */
  async hybrid(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    minCosine = DEFAULT_SEARCH_MIN_COSINE
  ): Promise<RetrievalResult[]> {
    const results = await this.semanticSvc
      .search(query, filters, limit, minCosine)
      .catch((error: unknown) => {
        console.warn(
          `[retrieval/hybrid] Semantic search failed; returning no results: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [] as RetrievalResult[];
      });

    if (!filters.includeSecret) {
      return results.filter((r) => {
        const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
        return !scopes.some(isSecretScope);
      });
    }

    return results;
  }

  /** Semantic leg alone; `score` on each hit is its cosine similarity to `query`. */
  async semanticSearch(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    minCosine = DEFAULT_SEARCH_MIN_COSINE
  ): Promise<RetrievalResult[]> {
    return this.semanticSvc.search(query, filters, limit, minCosine);
  }

  /** Engrams matching `filters`, newest first. No relevance ranking. */
  structuredOnly(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    return this.structuredSvc.query(filters, limit, offset);
  }

  /**
   * Find engrams similar to the given engram by its existing embedding vector.
   * No embedding call — reads the vector directly from `embeddings_vec`.
   * `score` on each hit is its cosine similarity to that engram.
   */
  async similar(
    engramId: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    minCosine = DEFAULT_SIMILAR_MIN_COSINE
  ): Promise<RetrievalResult[]> {
    const vector = this.semanticSvc.getVectorForEngram(engramId);
    if (!vector) {
      return [];
    }
    return this.semanticSvc.searchByVector({
      vectorBlob: vector,
      sourceIdToExclude: engramId,
      filters,
      limit,
      minCosine,
    });
  }
}
