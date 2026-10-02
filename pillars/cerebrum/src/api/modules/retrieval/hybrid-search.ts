/**
 * HybridSearchService — rank-fuses the retrieval legs with reciprocal rank
 * fusion (RRF, k=60) and backs the `search` / `context` / `similar` handlers.
 *
 * The semantic leg is the only leg. {@link StructuredQueryService} lists
 * engrams by filter, newest first; it never sees the query text, so it is not a
 * relevance signal and stays out of fusion. Filters constrain the candidate set
 * instead.
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

const RRF_K = 60;
const DEFAULT_LIMIT = 20;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/**
 * Merge ranked legs with RRF, best first. A hit several legs agree on has its
 * metadata merged and is marked `both`.
 */
function reciprocalRankFusion(legs: RetrievalResult[][], limit: number): RetrievalResult[] {
  const scores = new Map<string, { score: number; result: RetrievalResult; inBoth: boolean }>();

  for (const leg of legs) {
    for (const [i, r] of leg.entries()) {
      const key = `${r.sourceType}:${r.sourceId}`;
      const contribution = 1 / (RRF_K + i + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += contribution;
        existing.inBoth = true;
        existing.result = {
          ...existing.result,
          metadata: { ...existing.result.metadata, ...r.metadata },
        };
      } else {
        scores.set(key, { score: contribution, result: r, inBoth: false });
      }
    }
  }

  return [...scores.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, result, inBoth }) => ({
      ...result,
      score,
      matchType: inBoth ? ('both' as const) : result.matchType,
    }));
}

export class HybridSearchService {
  private readonly semanticSvc: SemanticSearchService;
  private readonly structuredSvc: StructuredQueryService;

  constructor(deps: SemanticSearchDeps) {
    this.semanticSvc = new SemanticSearchService(deps);
    this.structuredSvc = new StructuredQueryService(deps.db);
  }

  /**
   * Rank `query` against the corpus. `score` on each hit is the fused RRF
   * score, which orders hits and is not a similarity; `distance` still carries
   * the semantic leg's L2 distance.
   */
  async hybrid(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    minCosine = DEFAULT_SEARCH_MIN_COSINE
  ): Promise<RetrievalResult[]> {
    const semanticResults = await this.semanticSvc
      .search(query, filters, limit, minCosine)
      .catch((error: unknown) => {
        console.warn(
          `[retrieval/hybrid] Semantic search failed; returning no results: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [] as RetrievalResult[];
      });

    const merged = reciprocalRankFusion([semanticResults], limit);

    if (!filters.includeSecret) {
      return merged.filter((r) => {
        const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
        return !scopes.some(isSecretScope);
      });
    }

    return merged;
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
