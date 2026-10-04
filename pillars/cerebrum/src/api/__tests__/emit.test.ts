/**
 * Integration tests for `cerebrum.emit.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db seeded with engram-index +
 * embeddings rows, real sqlite-vec vectors at a chosen cosine to the request's
 * topic (a fake embedding client embeds every topic to the anchor vector), an
 * injected offline {@link makeFakeGenerationLlm} (no real Anthropic call), and
 * empty peer clients. The fake LLM echoes a citation so the citation-parser
 * path is exercised end-to-end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeFakeGenerationLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';
import { anchorEmbeddingClient, seedEngramVector, unitVectorAtCosine } from './vector-fixtures.js';

import type { GenerationLlm } from '../modules/emit/llm.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-emit-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-emit-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
  nextOffAxis = 1;
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

interface SeedEngramArgs {
  id: string;
  title: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  preview?: string;
  createdAt?: string;
  /** Cosine of the engram's vector to every topic. Defaults to 0.5. */
  cosine?: number;
}

let nextOffAxis = 1;

function seedEngram(db: OpenedCerebrumDb, args: SeedEngramArgs): void {
  const raw = db.raw;
  const createdAt = args.createdAt ?? '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, ?, 'manual', 'active', NULL, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      args.id,
      `${args.id}.md`,
      args.type ?? 'note',
      createdAt,
      createdAt,
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
    .run(args.id, `hash-${args.id}`, args.preview ?? `preview ${args.title}`, createdAt);
  seedEngramVector(db, args.id, unitVectorAtCosine(args.cosine ?? 0.5, nextOffAxis));
  nextOffAxis += 1;
}

function client(llm: GenerationLlm = makeFakeGenerationLlm(), withEmbeddings = true) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
      embeddingClient: withEmbeddings ? anchorEmbeddingClient() : undefined,
      emitLlm: llm,
    })
  );
}

describe('POST /emit/report', () => {
  it('synthesises a report and parses valid citations from the LLM output', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_db',
      title: 'DB choice',
      scopes: ['work.arch'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260102_0002_cache',
      title: 'Cache layer',
      scopes: ['work.arch'],
    });

    const llm = makeFakeGenerationLlm(
      () =>
        '# Architecture\n\nWe chose SQLite [eng_20260101_0001_db] and added a cache [eng_20260102_0002_cache].'
    );
    const { document } = await client(llm).emit.generateReport({ query: 'architecture' });

    expect(document).not.toBeNull();
    expect(document?.mode).toBe('report');
    expect(document?.title).toBe('Architecture');
    expect(document?.sources.map((s) => s.id).toSorted()).toEqual([
      'eng_20260101_0001_db',
      'eng_20260102_0002_cache',
    ]);
    expect(document?.metadata.sourceCount).toBe(2);
  });

  it('returns an insufficient-data notice with fewer than two sources', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_db',
      title: 'DB choice',
      scopes: ['work.arch'],
    });
    const result = await client().emit.generateReport({
      query: 'architecture',
      scopes: ['work.arch'],
    });
    expect(result.document).toBeNull();
    expect(result.notice).toMatch(/insufficient/i);
  });

  it('uses sources at cosine 0.4 to the topic and leaves out one at 0.32', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_a', title: 'A', cosine: 0.4 });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0002_b', title: 'B', cosine: 0.4 });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0003_c', title: 'C', cosine: 0.32 });

    const { document } = await client(
      makeFakeGenerationLlm(
        () => '# Report\n\n[eng_20260101_0001_a] [eng_20260101_0002_b] [eng_20260101_0003_c]'
      )
    ).emit.generateReport({ query: 'architecture' });

    expect(document?.sources.map((s) => s.id).toSorted()).toEqual([
      'eng_20260101_0001_a',
      'eng_20260101_0002_b',
    ]);
  });

  it('reports no relevant engrams, rather than the newest ones, without an embedding client', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_a', title: 'A', cosine: 0.9 });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0002_b', title: 'B', cosine: 0.9 });

    const result = await client(makeFakeGenerationLlm(), false).emit.generateReport({
      query: 'architecture',
    });

    expect(result.document).toBeNull();
    expect(result.notice).toBe('No relevant engrams found for this query');
  });
});

describe('POST /emit/summary', () => {
  it('requires from <= to (400 on inverted range)', async () => {
    await expect(
      client().emit.generateSummary({ dateRange: { from: '2026-02-01', to: '2026-01-01' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns an empty-summary document when no engrams match', async () => {
    const { document } = await client().emit.generateSummary({
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
    });
    expect(document).not.toBeNull();
    expect(document?.mode).toBe('summary');
    expect(document?.metadata.sourceCount).toBe(0);
  });

  it('digests every engram in the date range when no topic is given, embeddings or not', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260110_0001_in',
      title: 'In range',
      createdAt: '2026-01-10T00:00:00.000Z',
      cosine: 0,
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260301_0002_out',
      title: 'Out of range',
      createdAt: '2026-03-01T00:00:00.000Z',
      cosine: 0,
    });

    const { document } = await client(
      makeFakeGenerationLlm(() => '# Digest\n\nbody'),
      false
    ).emit.generateSummary({ dateRange: { from: '2026-01-01', to: '2026-01-31' } });

    expect(document?.sources.map((s) => s.id)).toEqual(['eng_20260110_0001_in']);
  });

  it('ranks against the topic when one is given, dropping engrams unrelated to it', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260110_0001_related',
      title: 'Related',
      createdAt: '2026-01-10T00:00:00.000Z',
      cosine: 0.6,
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260111_0002_unrelated',
      title: 'Unrelated',
      createdAt: '2026-01-11T00:00:00.000Z',
      cosine: 0.1,
    });

    const { document } = await client(
      makeFakeGenerationLlm(() => '# Digest\n\nbody')
    ).emit.generateSummary({
      query: 'databases',
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
    });

    expect(document?.sources.map((s) => s.id)).toEqual(['eng_20260110_0001_related']);
  });
});

describe('POST /emit/timeline', () => {
  it('orders entries chronologically and tags the source set', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_a',
      title: 'First',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260301_0002_b',
      title: 'Second',
      createdAt: '2026-03-01T00:00:00.000Z',
    });

    const { document } = await client(
      makeFakeGenerationLlm(() => '# Timeline\n\nentries')
    ).emit.generateTimeline({ query: 'history' });

    expect(document?.mode).toBe('timeline');
    expect(document?.metadata.sourceCount).toBe(2);
  });

  it('lists the engrams the filters select when no topic is given', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_a', title: 'Kept', tags: ['trip'], cosine: 0 });
    seedEngram(cerebrumDb, { id: 'eng_20260301_0002_b', title: 'Dropped', cosine: 0 });

    const { document } = await client(
      makeFakeGenerationLlm(() => '# Timeline\n\nentries'),
      false
    ).emit.generateTimeline({ tags: ['trip'] });

    expect(document?.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_a']);
  });
});

describe('POST /emit/generate', () => {
  it('rejects report mode without a query (400)', async () => {
    await expect(client().emit.generate({ mode: 'report' })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects summary mode without a date range (400)', async () => {
    await expect(client().emit.generate({ mode: 'summary' })).rejects.toMatchObject({
      status: 400,
    });
  });

  // Both statuses above were true before POPS-3043 too — cerebrum's
  // `ValidationError` took `(details: unknown)` and hardcoded
  // `'Validation failed'`, so all 31 of this pillar's explanations were
  // discarded and the two refusals above were indistinguishable on the wire.
  // Assert the body, which is the part that was wrong.
  it('says which mode is missing what, rather than answering "Validation failed"', async () => {
    await expect(client().emit.generate({ mode: 'report' })).rejects.toMatchObject({
      status: 400,
      body: { message: 'Query is required for report mode', code: 'cerebrum.request.invalid' },
    });
    await expect(client().emit.generate({ mode: 'summary' })).rejects.toMatchObject({
      status: 400,
      body: { message: 'Date range is required for summary mode' },
    });
  });
});

describe('emit model outcomes', () => {
  const refusingLlm: GenerationLlm = { generate: () => Promise.resolve({ kind: 'refused' }) };
  const cutOffLlm: GenerationLlm = {
    generate: () =>
      Promise.resolve({ kind: 'text', text: '# Cut off\n\nhalf a sent', outputTruncated: true }),
  };

  function seedTwo(): void {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_x', title: 'X', scopes: ['work'] });
    seedEngram(cerebrumDb, { id: 'eng_20260102_0002_y', title: 'Y', scopes: ['work'] });
  }

  it('returns a refusal as a notice with no document, for every mode', async () => {
    seedTwo();
    const emit = client(refusingLlm).emit;
    const dateRange = { from: '2026-01-01', to: '2026-12-31' };

    const results = [
      await emit.generateReport({ query: 'topic' }),
      await emit.generateSummary({ dateRange }),
      await emit.generateTimeline({ query: 'topic' }),
    ];
    for (const result of results) {
      expect(result.document).toBeNull();
      expect(result.notice).toBe('The model declined to generate this document');
    }
  });

  it('says so in the outline when the model refuses a preview', async () => {
    seedTwo();
    const result = await client(refusingLlm).emit.preview({ mode: 'report', query: 'topic' });
    expect(result.sources.length).toBe(2);
    expect(result.outline).toBe('The model declined to generate an outline for these sources.');
  });

  it('surfaces an output cut off at the token cap as metadata.outputTruncated', async () => {
    seedTwo();
    const { document } = await client(cutOffLlm).emit.generateReport({ query: 'topic' });
    expect(document?.metadata.outputTruncated).toBe(true);
    expect(document?.metadata.truncated).toBe(false);
  });

  it('leaves metadata.outputTruncated false for a complete document', async () => {
    seedTwo();
    const { document } = await client().emit.generateReport({ query: 'topic' });
    expect(document?.metadata.outputTruncated).toBe(false);
  });
});

describe('POST /emit/preview', () => {
  it('returns sources + an outline without full synthesis', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_x', title: 'X', scopes: ['work'] });
    seedEngram(cerebrumDb, { id: 'eng_20260102_0002_y', title: 'Y', scopes: ['work'] });

    const result = await client(
      makeFakeGenerationLlm(() => '# Outline\n\n- Section [eng_20260101_0001_x]')
    ).emit.preview({ mode: 'report', query: 'topic' });

    expect(result.sources.length).toBe(2);
    expect(result.outline).toContain('Outline');
  });

  it('returns a no-sources outline when retrieval is empty', async () => {
    const result = await client().emit.preview({ mode: 'report', query: 'nothing here' });
    expect(result.sources).toEqual([]);
    expect(result.outline).toMatch(/no sources/i);
  });
});
