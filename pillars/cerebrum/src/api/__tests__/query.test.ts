/**
 * Integration tests for `cerebrum.query.*` + the `POST /query/stream` SSE route.
 *
 * Boots the app against a per-test temp cerebrum.db seeded with engram-index +
 * embeddings rows and real sqlite-vec vectors at a chosen cosine to the query,
 * which a fake embedding client always embeds to the anchor vector. The
 * one-shot LLM is an injected {@link makeFakeQueryLlm}; the SSE route is driven
 * with an injected {@link makeFakeQueryStreamLlm} yielding canned tokens — no
 * real Anthropic call is ever made.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeFakeQueryLlm,
  makeFakeQueryStreamLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';
import { anchorEmbeddingClient, seedEngramVector, unitVectorAtCosine } from './vector-fixtures.js';

import type { Express } from 'express';

import type { QueryLlm, QueryStreamLlm } from '../modules/query/llm.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-query-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-query-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
  nextOffAxis = 1;
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

let nextOffAxis = 1;

/** Seed an engram whose vector sits at `cosine` to every query (default 0.5). */
function seedEngram(
  db: OpenedCerebrumDb,
  id: string,
  title: string,
  scopes: string[],
  cosine = 0.5
): void {
  const raw = db.raw;
  const at = '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, 'note', 'manual', 'active', NULL, ?, ?, ?, ?, 10, NULL)`
    )
    .run(id, `${id}.md`, at, at, title, `hash-${id}`);
  for (const scope of scopes) {
    raw.prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)').run(id, scope);
  }
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(id, `hash-${id}`, `preview ${title}`, at);
  seedEngramVector(db, id, unitVectorAtCosine(cosine, nextOffAxis));
  nextOffAxis += 1;
}

interface AppDeps {
  llm?: QueryLlm;
  streamLlm?: QueryStreamLlm;
  /** `null` boots the app with no embedding client at all. */
  embeddingClient?: EmbeddingClient | null;
}

function failingQueryLlm(): QueryLlm {
  return makeFakeQueryLlm(() => {
    throw new Error('the LLM must not be called when nothing was retrieved');
  });
}

function buildApp(deps: AppDeps = {}): Express {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry: makeTemplateRegistry(),
    engramRoot,
    reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3007',
    peerClients: makeEmptyPeerClients(),
    embeddingClient:
      deps.embeddingClient === null ? undefined : (deps.embeddingClient ?? anchorEmbeddingClient()),
    queryLlm: deps.llm ?? makeFakeQueryLlm(),
    queryStreamLlm: deps.streamLlm ?? makeFakeQueryStreamLlm(),
  });
}

function client(deps: AppDeps = {}) {
  return makeClient(buildApp(deps));
}

const { requestOn } = createTestTransport();

describe('POST /query/ask', () => {
  it('answers from a source at cosine 0.5 to the question and parses valid citations', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_db', 'DB choice', ['work']);
    const llm = makeFakeQueryLlm(() => 'We picked SQLite [eng_20260101_0001_db].');

    const res = await client({ llm }).query.ask({
      question: 'which database?',
      scopes: ['work'],
    });

    expect(res.answer).toContain('SQLite');
    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_db']);
    expect(res.scopes).toEqual(['work']);
  });

  it('strips hallucinated citations the LLM invents', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_real', 'Real', ['work']);
    const llm = makeFakeQueryLlm(
      () => 'Real [eng_20260101_0001_real] and fake [eng_20269999_9999_ghost].'
    );

    const res = await client({ llm }).query.ask({ question: 'what is real?' });

    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_real']);
    expect(res.answer).not.toContain('ghost');
  });

  it('returns a low-confidence no-info answer when nothing is retrieved', async () => {
    const res = await client().query.ask({ question: 'absolutely nothing matches' });
    expect(res.confidence).toBe('low');
    expect(res.sources).toEqual([]);
  });

  it('answers no-info without calling the LLM when the only engrams in scope are unrelated', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_recent', 'Recent but unrelated', ['work'], 0.1);

    const res = await client({ llm: failingQueryLlm() }).query.ask({
      question: 'which database?',
      scopes: ['work'],
    });

    expect(res.answer).toBe("I don't have information about that.");
    expect(res.sources).toEqual([]);
    expect(res.confidence).toBe('low');
  });

  it('answers no-info without calling the LLM when no embedding client is configured', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_db', 'DB choice', ['work'], 0.9);

    const res = await client({ llm: failingQueryLlm(), embeddingClient: null }).query.ask({
      question: 'which database?',
      scopes: ['work'],
    });

    expect(res.answer).toBe("I don't have information about that.");
    expect(res.sources).toEqual([]);
  });

  it('is highly confident in an answer citing two retrieved sources', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_one', 'One', ['work']);
    seedEngram(cerebrumDb, 'eng_20260101_0002_two', 'Two', ['work']);
    const llm = makeFakeQueryLlm(
      () => 'SQLite [eng_20260101_0001_one], confirmed [eng_20260101_0002_two].'
    );

    const res = await client({ llm }).query.ask({ question: 'which database?' });

    expect(res.confidence).toBe('high');
  });

  it('is moderately confident in an answer citing one retrieved source', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_one', 'One', ['work']);
    seedEngram(cerebrumDb, 'eng_20260101_0002_two', 'Two', ['work']);
    const llm = makeFakeQueryLlm(() => 'SQLite [eng_20260101_0001_one].');

    const res = await client({ llm }).query.ask({ question: 'which database?' });

    expect(res.confidence).toBe('medium');
  });

  it('has low confidence in an answer that says the context was not enough', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_one', 'One', ['work']);
    seedEngram(cerebrumDb, 'eng_20260101_0002_two', 'Two', ['work']);
    const llm = makeFakeQueryLlm(
      () =>
        "I don't have enough information to answer that fully. " +
        '[eng_20260101_0001_one] [eng_20260101_0002_two]'
    );

    const res = await client({ llm }).query.ask({ question: 'which database?' });

    expect(res.sources).toHaveLength(2);
    expect(res.confidence).toBe('low');
  });
});

describe('POST /query/retrieve', () => {
  it('returns sources without calling the LLM', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_a', 'Alpha', ['work']);
    const res = await client().query.retrieve({ question: 'alpha' });
    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_a']);
  });

  it('returns no sources when the only engram is unrelated to the question', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_a', 'Alpha', ['work'], 0.1);
    const res = await client().query.retrieve({ question: 'alpha' });
    expect(res.sources).toEqual([]);
  });
});

describe('POST /query/explain', () => {
  it('echoes scope inference + retrieval plan and flags secret mentions', async () => {
    const res = await client().query.explain('what is my secret password?');
    expect(res.scopeInference.source).toBe('default');
    expect(res.retrievalPlan.maxSources).toBeGreaterThan(0);
    expect(res.secretNotice).not.toBeNull();
  });
});

function parseSseFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as Record<string, unknown>);
}

describe('POST /query/stream (SSE)', () => {
  it('streams token frames followed by a terminal done frame', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_s', 'Streamed', ['work']);
    const streamLlm = makeFakeQueryStreamLlm(['SQLite ', '[eng_20260101_0001_s] ', 'wins.']);

    const res = await requestOn(buildApp({ streamLlm }))
      .post('/query/stream')
      .send({ question: 'which database?' });

    expect(res.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(res.text);
    const tokens = frames.filter((f) => f['type'] === 'token');
    const done = frames.find((f) => f['type'] === 'done');

    expect(tokens.length).toBe(3);
    expect(tokens.map((t) => t['text']).join('')).toContain('SQLite');
    if (done === undefined) throw new Error('expected a done frame');
    expect(done['answer']).toContain('SQLite');
    expect((done['sources'] as Array<{ id: string }>).map((s) => s.id)).toEqual([
      'eng_20260101_0001_s',
    ]);
    expect(done['confidence']).toBe('medium');
  });

  it('grades a streamed answer citing two sources as high confidence', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_s', 'Streamed', ['work']);
    seedEngram(cerebrumDb, 'eng_20260101_0002_t', 'Second', ['work']);
    const streamLlm = makeFakeQueryStreamLlm([
      'SQLite [eng_20260101_0001_s] ',
      'wins [eng_20260101_0002_t].',
    ]);

    const res = await requestOn(buildApp({ streamLlm }))
      .post('/query/stream')
      .send({ question: 'which database?' });

    const done = parseSseFrames(res.text).find((f) => f['type'] === 'done');
    expect(done?.['confidence']).toBe('high');
  });

  it('streams the no-info answer when the only engram is unrelated to the question', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_s', 'Unrelated', ['work'], 0.1);

    const res = await requestOn(buildApp())
      .post('/query/stream')
      .send({ question: 'which database?' });

    const frames = parseSseFrames(res.text);
    const done = frames.find((f) => f['type'] === 'done');
    expect(frames.filter((f) => f['type'] === 'token').map((f) => f['text'])).toEqual([
      "I don't have information about that.",
    ]);
    expect(done?.['sources']).toEqual([]);
    expect(done?.['confidence']).toBe('low');
  });

  it('emits a single-token no-info stream when nothing is retrieved', async () => {
    const res = await requestOn(buildApp())
      .post('/query/stream')
      .send({ question: 'nothing at all matches this' });

    const frames = parseSseFrames(res.text);
    const done = frames.find((f) => f['type'] === 'done');
    expect(done?.['confidence']).toBe('low');
    expect(done?.['sources']).toEqual([]);
  });

  it('rejects an invalid body with 400 before opening the stream', async () => {
    const res = await requestOn(buildApp()).post('/query/stream').send({ question: '' });
    expect(res.status).toBe(400);
  });
});
