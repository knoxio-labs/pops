/**
 * Integration tests for `cerebrum.retrieval.*` over REST.
 *
 * Seeds `engram_index` + junction + `embeddings` (and, where sqlite-vec is
 * available, `embeddings_vec`) directly via raw SQL against a per-test temp
 * cerebrum.db, then drives search / context / similar / stats through the
 * supertest client.
 *
 * The cross-pillar enrichment rewire is exercised with injected fake
 * {@link PeerClients} returning canned rows — no live peer-api needed. The
 * embedding path is exercised with a fake embedding client — no real provider
 * needed. The no-vec degradation is exercised by opening the db with
 * `loadVec: false`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeCerebrumApiDeps, makeClient, makeEmptyPeerClients } from './test-utils.js';
import { anchorEmbeddingClient, seedEngramVector, unitVectorAtCosine } from './vector-fixtures.js';

import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

interface AppOpts {
  db?: OpenedCerebrumDb;
  peers?: PeerClients;
  embeddingClient?: EmbeddingClient;
}

function client(opts: AppOpts = {}) {
  return makeClient(
    createCerebrumApiApp(
      makeCerebrumApiDeps(
        { cerebrumDb: opts.db ?? cerebrumDb, tmpDir, engramRoot },
        {
          peerClients: opts.peers ?? makeEmptyPeerClients(),
          embeddingClient: opts.embeddingClient,
        }
      )
    )
  );
}

interface SeedEngramArgs {
  id: string;
  title: string;
  type?: string;
  status?: string;
  scopes?: string[];
  tags?: string[];
  preview?: string;
  modifiedAt?: string;
}

function seedEngram(db: OpenedCerebrumDb, args: SeedEngramArgs): void {
  const raw = db.raw;
  const modifiedAt = args.modifiedAt ?? '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, ?, 'manual', ?, NULL, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      args.id,
      `${args.id}.md`,
      args.type ?? 'note',
      args.status ?? 'active',
      modifiedAt,
      modifiedAt,
      args.title,
      `hash-${args.id}`,
      10
    );
  for (const scope of args.scopes ?? []) {
    raw.prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)').run(args.id, scope);
  }
  for (const tag of args.tags ?? []) {
    raw.prepare('INSERT INTO engram_tags (engram_id, tag) VALUES (?, ?)').run(args.id, tag);
  }
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(args.id, `hash-${args.id}`, args.preview ?? `preview ${args.title}`, modifiedAt);
}

/**
 * Seed (or reuse) the chunk-0 `embeddings` row for a source and attach a vec
 * vector to it. `unit` selects the dimension set to 1. Engrams already carry an
 * `embeddings` row from {@link seedEngram}, so the insert is ignore-on-conflict
 * and the existing row's id is reused.
 */
function seedVector(
  db: OpenedCerebrumDb,
  sourceType: string,
  sourceId: string,
  unit: number
): void {
  db.raw
    .prepare(
      `INSERT OR IGNORE INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES (?, ?, 0, ?, ?, 'm', 1536, '2026-01-01T00:00:00.000Z')`
    )
    .run(sourceType, sourceId, `hash-${sourceId}`, `preview ${sourceId}`);
  const id = db.raw
    .prepare(
      'SELECT id FROM embeddings WHERE source_type = ? AND source_id = ? AND chunk_index = 0'
    )
    .pluck()
    .get(sourceType, sourceId) as number;
  const vec = new Float32Array(1536);
  vec[unit] = 1;
  db.raw
    .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
    .run(BigInt(id), Buffer.from(vec.buffer));
}

/** A fake embedding client returning a fixed unit vector at index `unit`. */
function fakeEmbeddingClient(unit: number): EmbeddingClient {
  return {
    embedQuery: async () => {
      const v = Array.from<number>({ length: 1536 }).fill(0);
      v[unit] = 1;
      return v;
    },
  };
}

describe('GET /retrieval/stats', () => {
  it('reports indexed + embedded counts, per-source-type breakdown, and last-updated', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_alpha', title: 'Alpha' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_beta', title: 'Beta' });
    seedVector(cerebrumDb, 'transaction', 'txn_1', 5);

    const stats = await client().retrieval.stats();
    expect(stats.indexed).toBe(2);
    expect(stats.embedded).toBe(3);
    expect(stats.sourceTypes['engram']).toBe(2);
    expect(stats.sourceTypes['transaction']).toBe(1);
    expect(stats.lastUpdated).not.toBeNull();
  });

  it('reports zeros on an empty index', async () => {
    const stats = await client().retrieval.stats();
    expect(stats).toEqual({ indexed: 0, embedded: 0, sourceTypes: {}, lastUpdated: null });
  });
});

describe('POST /retrieval/search — structured', () => {
  it('filters engrams by scope and returns a total', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_beta',
      title: 'Beta',
      scopes: ['work.projects.beta'],
    });

    const res = await client().retrieval.search({
      mode: 'structured',
      filters: { scopes: ['work.projects.alpha'] },
    });
    expect(res.meta.mode).toBe('structured');
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.sourceId).toBe('eng_20260101_0000_alpha');
    expect(res.results[0]?.matchType).toBe('structured');
    expect(res.results[0]?.contentPreview).toContain('Alpha');
  });

  it('excludes secret-scoped engrams unless includeSecret is set', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_open',
      title: 'Open',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_secret',
      title: 'Secret',
      scopes: ['personal.secret.diary'],
    });

    const visible = await client().retrieval.search({
      mode: 'structured',
      filters: { types: ['note'] },
    });
    expect(visible.results.map((r) => r.sourceId)).not.toContain('eng_20260101_0000_secret');

    const withSecret = await client().retrieval.search({
      mode: 'structured',
      filters: { types: ['note'], includeSecret: true },
    });
    expect(withSecret.results.map((r) => r.sourceId)).toContain('eng_20260101_0000_secret');
  });

  it('400s on structured mode with no filter', async () => {
    await expect(client().retrieval.search({ mode: 'structured' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400s on semantic/hybrid mode with no query', async () => {
    await expect(client().retrieval.search({ mode: 'semantic' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(client().retrieval.search({ mode: 'hybrid' })).rejects.toMatchObject({
      status: 400,
    });
  });

  // All three statuses above were true before POPS-3043 too. Until then these
  // handlers threw the bare i18n key `retrieval.queryRequired` as the message
  // and cerebrum's `ValidationError` discarded it, so every one of them
  // answered `Validation failed` and a caller could not tell a missing query
  // from a missing filter. Assert the body, which is the part that was wrong.
  it.each([
    [{ mode: 'semantic' as const }, 'Query is required for semantic and hybrid search modes'],
    [{ mode: 'hybrid' as const }, 'Query is required for semantic and hybrid search modes'],
    [{ mode: 'structured' as const }, 'Structured search requires at least one filter'],
  ])(
    'says what %o is missing, rather than answering "Validation failed"',
    async (body, message) => {
      await expect(client().retrieval.search(body)).rejects.toMatchObject({
        status: 400,
        body: { message, code: 'cerebrum.request.invalid' },
      });
    }
  );
});

describe('POST /retrieval/search — semantic + cross-pillar enrichment', () => {
  it('embeds the query, kNN-matches a cross-pillar hit, and enriches it via the peer client', async () => {
    seedVector(cerebrumDb, 'transaction', 'txn_42', 0);

    const peers: PeerClients = {
      finance: {
        getTransaction: async (id) => {
          expect(id).toBe('txn_42');
          return {
            description: 'Coffee at Blue Bottle',
            entityName: 'Blue Bottle',
            tags: ['coffee'],
            notes: 'morning',
          };
        },
        listTransactions: () => Promise.resolve({ rows: [], hasMore: false }),
      },
    };

    const res = await client({ peers, embeddingClient: fakeEmbeddingClient(0) }).retrieval.search({
      mode: 'semantic',
      query: 'coffee',
    });

    expect(res.results).toHaveLength(1);
    const hit = res.results[0];
    expect(hit?.sourceType).toBe('transaction');
    expect(hit?.sourceId).toBe('txn_42');
    expect(hit?.title).toBe('Coffee at Blue Bottle');
    expect(hit?.matchType).toBe('semantic');
    expect(String(hit?.metadata['text'])).toContain('Blue Bottle');
  });

  it('drops a cross-pillar hit when its peer is absent from the registry', async () => {
    seedVector(cerebrumDb, 'movie', '99', 0);

    // No `media` peer client → enrichment unavailable → hit dropped, no crash.
    const res = await client({
      peers: makeEmptyPeerClients(),
      embeddingClient: fakeEmbeddingClient(0),
    }).retrieval.search({ mode: 'semantic', query: 'film' });

    expect(res.results).toHaveLength(0);
  });

  it('returns no semantic results when no embedding client is configured', async () => {
    seedVector(cerebrumDb, 'transaction', 'txn_1', 0);
    const res = await client().retrieval.search({ mode: 'semantic', query: 'anything' });
    expect(res.results).toHaveLength(0);
  });
});

describe('POST /retrieval/search — hybrid', () => {
  it('keeps a hit at cosine 0.5 and drops one at 0.2 on the default threshold', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_related', title: 'Related' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_unrelated', title: 'Unrelated' });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_related', unitVectorAtCosine(0.5, 1));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_unrelated', unitVectorAtCosine(0.2, 2));

    const res = await client({ embeddingClient: anchorEmbeddingClient() }).retrieval.search({
      mode: 'hybrid',
      query: 'anything',
    });

    expect(res.results.map((r) => r.sourceId)).toEqual(['eng_20260101_0000_related']);
    expect(res.results[0]?.matchType).toBe('semantic');
  });

  it('returns nothing, not the newest engrams, when no engram is semantically close', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_newest',
      title: 'Newest',
      scopes: ['work.projects.alpha'],
      modifiedAt: '2026-09-01T00:00:00.000Z',
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_orthogonal',
      title: 'Orthogonal',
      scopes: ['work.projects.alpha'],
    });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_orthogonal', unitVectorAtCosine(0, 1));

    const res = await client({ embeddingClient: anchorEmbeddingClient() }).retrieval.search({
      mode: 'hybrid',
      query: 'anything',
      filters: { scopes: ['work.projects.alpha'] },
    });

    expect(res.results).toEqual([]);
    expect(res.meta.total).toBe(0);
  });

  it('returns nothing when no embedding client is configured', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_alpha', title: 'Alpha', tags: ['x'] });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_alpha', unitVectorAtCosine(1, 1));

    const res = await client().retrieval.search({
      mode: 'hybrid',
      query: 'alpha',
      filters: { tags: ['x'] },
    });

    expect(res.results).toEqual([]);
  });

  it('returns nothing, without failing, when the db has no vec support', async () => {
    const noVecDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-novec-'));
    const noVecDb = openCerebrumDb(join(noVecDir, 'cerebrum.db'), { loadVec: false });
    expect(noVecDb.vecAvailable).toBe(false);
    seedEngram(noVecDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
      tags: ['x'],
    });

    try {
      const res = await client({
        db: noVecDb,
        embeddingClient: anchorEmbeddingClient(),
      }).retrieval.search({ mode: 'hybrid', query: 'alpha', filters: { tags: ['x'] } });
      expect(res.results).toEqual([]);
    } finally {
      noVecDb.raw.close();
      rmSync(noVecDir, { recursive: true, force: true });
    }
  });

  it('applies the threshold as a minimum cosine', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_close', title: 'Close' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_closer', title: 'Closer' });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_close', unitVectorAtCosine(0.5, 1));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_closer', unitVectorAtCosine(0.8, 2));
    const c = client({ embeddingClient: anchorEmbeddingClient() });

    const strict = await c.retrieval.search({ mode: 'hybrid', query: 'q', threshold: 0.6 });
    expect(strict.results.map((r) => r.sourceId)).toEqual(['eng_20260101_0000_closer']);

    const loose = await c.retrieval.search({ mode: 'hybrid', query: 'q', threshold: 0.4 });
    expect(loose.results.map((r) => r.sourceId)).toEqual([
      'eng_20260101_0000_closer',
      'eng_20260101_0000_close',
    ]);
  });

  it('rejects a threshold outside the cosine range a caller may ask for', async () => {
    await expect(
      client().retrieval.search({ mode: 'hybrid', query: 'q', threshold: 1.2 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('constrains semantic candidates by every filter, not only scope and type', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_tagged',
      title: 'Tagged',
      tags: ['keep'],
      modifiedAt: '2026-03-01T00:00:00.000Z',
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_untagged',
      title: 'Untagged',
      modifiedAt: '2026-03-01T00:00:00.000Z',
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_old',
      title: 'Old',
      tags: ['keep'],
      modifiedAt: '2025-01-01T00:00:00.000Z',
    });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_tagged', unitVectorAtCosine(0.9, 1));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_untagged', unitVectorAtCosine(0.9, 2));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_old', unitVectorAtCosine(0.9, 3));
    const c = client({ embeddingClient: anchorEmbeddingClient() });

    const byTag = await c.retrieval.search({
      mode: 'hybrid',
      query: 'q',
      filters: { tags: ['keep'], dateRange: { from: '2026-01-01T00:00:00.000Z' } },
    });
    expect(byTag.results.map((r) => r.sourceId)).toEqual(['eng_20260101_0000_tagged']);

    const semanticOnly = await c.retrieval.search({
      mode: 'semantic',
      query: 'q',
      filters: { tags: ['keep'], dateRange: { from: '2026-01-01T00:00:00.000Z' } },
    });
    expect(semanticOnly.results.map((r) => r.sourceId)).toEqual(['eng_20260101_0000_tagged']);
  });
});

describe('POST /retrieval/search — semantic score', () => {
  it('reports cosine similarity as the score and keeps the L2 distance beside it', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_half', title: 'Half' });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_half', unitVectorAtCosine(0.5, 1));

    const res = await client({ embeddingClient: anchorEmbeddingClient() }).retrieval.search({
      mode: 'semantic',
      query: 'q',
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.score).toBeCloseTo(0.5, 5);
    expect(res.results[0]?.distance).toBeCloseTo(1, 5);
  });
});

describe('POST /retrieval/similar', () => {
  it('returns the other engrams sharing the query engram vector, excluding itself', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_self',
      title: 'Self',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_other',
      title: 'Other',
      scopes: ['work.projects.alpha'],
    });
    seedVector(cerebrumDb, 'engram', 'eng_20260101_0000_self', 0);
    seedVector(cerebrumDb, 'engram', 'eng_20260101_0000_other', 0);

    const res = await client().retrieval.similar({ engramId: 'eng_20260101_0000_self' });
    const ids = res.results.map((r) => r.sourceId);
    expect(ids).toContain('eng_20260101_0000_other');
    expect(ids).not.toContain('eng_20260101_0000_self');
  });

  it('keeps a neighbour at cosine 0.9 and drops one at 0.5 on the default threshold', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_self', title: 'Self' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_near', title: 'Near' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_far', title: 'Far' });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_self', unitVectorAtCosine(1, 1));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_near', unitVectorAtCosine(0.9, 2));
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_far', unitVectorAtCosine(0.5, 3));
    const c = client();

    const byDefault = await c.retrieval.similar({ engramId: 'eng_20260101_0000_self' });
    expect(byDefault.results.map((r) => r.sourceId)).toEqual(['eng_20260101_0000_near']);
    expect(byDefault.results[0]?.score).toBeCloseTo(0.9, 5);

    const loose = await c.retrieval.similar({
      engramId: 'eng_20260101_0000_self',
      threshold: 0.4,
    });
    expect(loose.results.map((r) => r.sourceId)).toEqual([
      'eng_20260101_0000_near',
      'eng_20260101_0000_far',
    ]);
  });

  it('returns an empty list for an engram with no vector', async () => {
    const res = await client().retrieval.similar({ engramId: 'eng_20260101_0000_missing' });
    expect(res.results).toEqual([]);
  });
});

describe('POST /retrieval/context', () => {
  it('assembles a token-budgeted context window with source attribution', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
      tags: ['ctx'],
      preview: 'The alpha engram body for context.',
    });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_alpha', unitVectorAtCosine(0.5, 1));

    const res = await client({ embeddingClient: anchorEmbeddingClient() }).retrieval.context({
      query: 'alpha',
      filters: { tags: ['ctx'] },
      tokenBudget: 2048,
    });
    expect(res.context).toContain('Query: alpha');
    expect(res.context).toContain('Alpha');
    expect(res.sources.map((s) => s.sourceId)).toContain('eng_20260101_0000_alpha');
    expect(res.truncated).toBe(false);
    expect(res.tokenEstimate).toBeGreaterThan(0);
  });

  it('assembles no sources when nothing is semantically close to the query', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      tags: ['ctx'],
    });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_alpha', unitVectorAtCosine(0.1, 1));

    const res = await client({ embeddingClient: anchorEmbeddingClient() }).retrieval.context({
      query: 'alpha',
      filters: { tags: ['ctx'] },
    });

    expect(res.sources).toEqual([]);
    expect(res.context).not.toContain('Alpha');
  });

  it('400s on an empty query', async () => {
    await expect(client().retrieval.context({ query: '   ' })).rejects.toMatchObject({
      status: 400,
    });
  });

  // POPS-3043: the status alone was true while the body said nothing.
  it('says the query is required, rather than answering "Validation failed"', async () => {
    await expect(client().retrieval.context({ query: '   ' })).rejects.toMatchObject({
      status: 400,
      body: {
        message: 'Query is required for context assembly',
        code: 'cerebrum.request.invalid',
      },
    });
  });
});
