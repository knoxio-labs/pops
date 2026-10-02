import { cosineToMaxL2, DEFAULT_SEARCH_MIN_COSINE, DEFAULT_SIMILAR_MIN_COSINE } from './cosine.js';
import {
  collectResults,
  dedupeBySource,
  knnQuery,
  vecUnavailableError,
} from './semantic-search-helpers.js';
import { resolveMetadata } from './semantic-search-metadata.js';

/**
 * SemanticSearchService — k-NN over `embeddings_vec` with engram + cross-pillar
 * metadata resolution, scope/type/status filtering, and `RetrievalResult`
 * shaping.
 *
 *  - The query vector comes from the injected {@link EmbeddingClient}. With no
 *    client configured (no `EMBEDDING_API_KEY`), `search` returns no results
 *    and hybrid falls back to its lexical leg. A provider error is swallowed
 *    to the same no-results path so a flaky embedder never crashes retrieval.
 *  - Thresholds are minimum cosine similarity. They are converted to the L2
 *    ceiling sqlite-vec understands here and nowhere else; see `cosine.ts`.
 *  - kNN reads the pillar's own raw handle (`embeddings` + `embeddings_vec`
 *    live in cerebrum.db); vector availability is `vecAvailable`, captured at
 *    construction.
 *  - Metadata resolution goes through {@link resolveMetadata} with the pillar
 *    drizzle handle + injected peer clients.
 */
import type BetterSqlite3 from 'better-sqlite3';

import type { CerebrumDb } from '../../../db/index.js';
import type { EmbeddingClient } from './embedding-client.js';
import type { PeerClients } from './peer-clients.js';
import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;

export interface SemanticSearchDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  peers: PeerClients;
  /** Absent → semantic search returns no results and hybrid is lexical only. */
  embeddingClient?: EmbeddingClient;
}

export interface SearchByVectorOptions {
  vectorBlob: Float32Array;
  sourceIdToExclude: string;
  filters?: RetrievalFilters;
  limit?: number;
  /** Minimum cosine similarity a neighbour must reach. */
  minCosine?: number;
}

export class SemanticSearchService {
  constructor(private readonly deps: SemanticSearchDeps) {}

  /** Embed `query` via the injected client; null when unconfigured or failing. */
  private async embedQuery(query: string): Promise<number[] | null> {
    if (!this.deps.embeddingClient) return null;
    try {
      return await this.deps.embeddingClient.embedQuery(query);
    } catch (err) {
      console.warn(
        `[retrieval/semantic] embedQuery failed; returning no semantic results: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return null;
    }
  }

  async search(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    minCosine = DEFAULT_SEARCH_MIN_COSINE
  ): Promise<RetrievalResult[]> {
    if (!query.trim()) {
      throw Object.assign(new Error('Query is required for semantic search'), {
        code: 'EMPTY_QUERY',
      });
    }
    if (!this.deps.embeddingClient) return [];
    if (!this.deps.vecAvailable) throw vecUnavailableError();

    const queryVector = await this.embedQuery(query);
    if (!queryVector) return [];
    const vectorBlob = Float32Array.from(queryVector);
    const maxDistance = cosineToMaxL2(minCosine);
    const rows = knnQuery(this.deps.raw, vectorBlob, limit * 3).filter(
      (r) => r.distance <= maxDistance
    );
    const seen = dedupeBySource(rows);

    return collectResults({
      rows: seen.values(),
      filters,
      limit,
      resolveMetadata: (st, sid, f) =>
        resolveMetadata({ db: this.deps.db, peers: this.deps.peers }, st, sid, f),
    });
  }

  /**
   * Run a k-NN search using an existing vector blob (read from embeddings_vec).
   * Used by `similar` — no embedding call needed.
   */
  async searchByVector(opts: SearchByVectorOptions): Promise<RetrievalResult[]> {
    if (!this.deps.vecAvailable) throw vecUnavailableError();
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const maxDistance = cosineToMaxL2(opts.minCosine ?? DEFAULT_SIMILAR_MIN_COSINE);
    const filters = opts.filters ?? {};

    const rows = knnQuery(this.deps.raw, opts.vectorBlob, limit * 3).filter(
      (r) => r.distance <= maxDistance && r.source_id !== opts.sourceIdToExclude
    );
    const seen = dedupeBySource(rows);

    return collectResults({
      rows: seen.values(),
      filters,
      limit,
      resolveMetadata: (st, sid, f) =>
        resolveMetadata({ db: this.deps.db, peers: this.deps.peers }, st, sid, f),
    });
  }

  /** Retrieve the embedding vector blob for an engram by its source ID. */
  getVectorForEngram(engramId: string): Float32Array | null {
    const row = this.deps.raw
      .prepare(
        `
        SELECT ev.vector
        FROM embeddings_vec ev
        JOIN embeddings e ON e.id = ev.rowid
        WHERE e.source_type = 'engram' AND e.source_id = ?
        ORDER BY e.chunk_index
        LIMIT 1
      `
      )
      .get(engramId) as { vector: Buffer } | undefined;

    if (!row) return null;
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
  }
}
