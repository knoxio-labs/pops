/**
 * Retrieval with the lexical leg, end to end over REST. Engrams are written
 * through `POST /engrams`, so the search text comes from the real write path.
 *
 * Most suites boot with no embedding client, which is how a deployment with no
 * embedding API key runs: every hit there is a lexical one.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeCerebrumApiDeps,
  makeClient,
  makeFakeEgoLlm,
  makeFakeGenerationLlm,
  makeFakeQueryLlm,
} from './test-utils.js';
import { anchorEmbeddingClient, seedEngramVector, unitVectorAtCosine } from './vector-fixtures.js';

import type { CerebrumApiDeps } from '../handlers.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-lexical-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-lexical-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client(overrides: Partial<CerebrumApiDeps> = {}, db: OpenedCerebrumDb = cerebrumDb) {
  return makeClient(
    createCerebrumApiApp(makeCerebrumApiDeps({ cerebrumDb: db, tmpDir, engramRoot }, overrides))
  );
}

type Client = ReturnType<typeof client>;

async function write(c: Client, title: string, text: string): Promise<string> {
  const { engram } = await c.engrams.create({
    type: 'note',
    title,
    body: `# ${title}\n\n${text}`,
    scopes: ['work.notes'],
  });
  return engram.id;
}

interface Corpus {
  cluster: string;
  rollout: string;
  unrelated: string;
}

/** Two engrams about the karbon migration, and a newer one about neither. */
async function writeCorpus(c: Client): Promise<Corpus> {
  const cluster = await write(
    c,
    'Cluster decision',
    'We decided the karbon migration happens in March, over one weekend.'
  );
  const rollout = await write(
    c,
    'Rollout plan',
    'Karbon goes region by region; the migration checklist lives in the runbook.'
  );
  const unrelated = await write(
    c,
    'Sourdough',
    'What I did about the starter: fed it and left it in the cupboard.'
  );
  return { cluster, rollout, unrelated };
}

const QUESTION = 'what did I decide about the karbon migration';

describe('POST /retrieval/search (hybrid) with no embedding client', () => {
  it('returns the engrams that contain the words of the query, and not the newest unrelated one', async () => {
    const c = client();
    const { cluster, rollout, unrelated } = await writeCorpus(c);

    const { results } = await c.retrieval.search({ query: QUESTION, mode: 'hybrid' });

    expect(results[0]?.sourceId).toBe(cluster);
    expect(results.map((r) => r.sourceId).toSorted()).toEqual([cluster, rollout].toSorted());
    expect(results.map((r) => r.sourceId)).not.toContain(unrelated);
    expect(results.every((r) => r.matchType === 'lexical')).toBe(true);
    expect(results[0]?.score).toBe(1);
    expect(results.every((r) => r.score > 0 && r.score <= 1)).toBe(true);
  });

  it('follows an edit made through the engram API', async () => {
    const c = client();
    const { cluster, rollout } = await writeCorpus(c);

    await c.engrams.update(cluster, { body: '# Cluster decision\n\nPostponed until the autumn.' });

    const karbon = await c.retrieval.search({ query: 'karbon', mode: 'hybrid' });
    const autumn = await c.retrieval.search({ query: 'autumn', mode: 'hybrid' });
    expect(karbon.results.map((r) => r.sourceId)).toEqual([rollout]);
    expect(autumn.results.map((r) => r.sourceId)).toEqual([cluster]);
  });

  it('applies the status filter to an engram archived through the engram API', async () => {
    const c = client();
    const { cluster, rollout } = await writeCorpus(c);

    await c.engrams.delete(rollout);

    const { results } = await c.retrieval.search({
      query: 'karbon',
      mode: 'hybrid',
      filters: { status: ['active'] },
    });
    expect(results.map((r) => r.sourceId)).toEqual([cluster]);
  });

  it('returns nothing when no engram contains a word of the query', async () => {
    const c = client();
    await writeCorpus(c);

    const { results } = await c.retrieval.search({ query: 'zeppelin', mode: 'hybrid' });

    expect(results).toEqual([]);
  });
});

describe('POST /retrieval/search (hybrid) when the semantic leg cannot run', () => {
  it('returns the lexical hits when the embedding provider fails', async () => {
    const c = client({
      embeddingClient: { embedQuery: () => Promise.reject(new Error('provider down')) },
    });
    const { cluster } = await writeCorpus(c);

    const { results } = await c.retrieval.search({ query: QUESTION, mode: 'hybrid' });

    expect(results[0]?.sourceId).toBe(cluster);
    expect(results.every((r) => r.matchType === 'lexical')).toBe(true);
  });

  it('returns the lexical hits when sqlite-vec is not loaded', async () => {
    const noVecDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-lexical-novec-'));
    const noVec = openCerebrumDb(join(noVecDir, 'cerebrum.db'), { loadVec: false });
    try {
      const c = client({ embeddingClient: anchorEmbeddingClient() }, noVec);
      const { cluster } = await writeCorpus(c);

      const { results } = await c.retrieval.search({ query: QUESTION, mode: 'hybrid' });

      expect(results[0]?.sourceId).toBe(cluster);
      expect(results.every((r) => r.matchType === 'lexical')).toBe(true);
    } finally {
      noVec.raw.close();
      rmSync(noVecDir, { recursive: true, force: true });
    }
  });
});

describe('POST /retrieval/search (hybrid) with both legs', () => {
  it('ranks a source both legs found first, and scores it by cosine', async () => {
    const c = client({ embeddingClient: anchorEmbeddingClient() });
    const both = await write(c, 'Cluster decision', 'The karbon migration happens in March.');
    const semanticOnly = await write(c, 'Capacity', 'Rack space is booked for the spring move.');
    const lexicalOnly = await write(c, 'Rollout plan', 'Karbon goes region by region.');
    seedEngramVector(cerebrumDb, both, unitVectorAtCosine(0.6, 1));
    seedEngramVector(cerebrumDb, semanticOnly, unitVectorAtCosine(0.9, 2));

    const { results } = await c.retrieval.search({ query: 'karbon', mode: 'hybrid' });

    expect(results.map((r) => [r.sourceId, r.matchType])).toEqual([
      [both, 'both'],
      [semanticOnly, 'semantic'],
      [lexicalOnly, 'lexical'],
    ]);
    expect(results[0]?.score).toBeCloseTo(0.6, 3);
    expect(results[1]?.score).toBeCloseTo(0.9, 3);
    expect(results.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
  });
});

describe('POST /query/ask with no embedding client', () => {
  it('answers from the lexically matched sources and reports high confidence', async () => {
    let systemPrompt = '';
    let ids: Corpus | undefined;
    const c = client({
      queryLlm: makeFakeQueryLlm((prompt) => {
        systemPrompt = prompt;
        return `March, region by region [${ids?.cluster}] [${ids?.rollout}].`;
      }),
    });
    ids = await writeCorpus(c);

    const res = await c.query.ask({ question: QUESTION, scopes: ['work'] });

    expect(res.sources.map((s) => s.id).toSorted()).toEqual([ids.cluster, ids.rollout].toSorted());
    expect(res.confidence).toBe('high');
    expect(systemPrompt).toContain('karbon migration happens in March');
    expect(systemPrompt).not.toContain('Sourdough');
  });

  it('reports medium confidence when the answer cites a single source', async () => {
    let ids: Corpus | undefined;
    const c = client({ queryLlm: makeFakeQueryLlm(() => `March [${ids?.cluster}].`) });
    ids = await writeCorpus(c);

    const res = await c.query.ask({ question: QUESTION, scopes: ['work'] });

    expect(res.confidence).toBe('medium');
  });

  it('answers no-info without calling the LLM when no engram contains a word of the question', async () => {
    const c = client({
      queryLlm: makeFakeQueryLlm(() => {
        throw new Error('the LLM must not be called when nothing was retrieved');
      }),
    });
    await writeCorpus(c);

    const res = await c.query.ask({ question: 'where is the zeppelin?', scopes: ['work'] });

    expect(res.answer).toBe("I don't have information about that.");
    expect(res.sources).toEqual([]);
    expect(res.confidence).toBe('low');
  });
});

describe('ego and emit with no embedding client', () => {
  it('gives an ego turn the lexically matched engrams as context', async () => {
    const c = client({ egoLlm: makeFakeEgoLlm('Canned ego reply.') });
    const { cluster, rollout } = await writeCorpus(c);

    const turn = await c.ego.chat({ message: QUESTION, scopes: ['work.notes'] });
    const active = await c.ego.getActiveContext(turn.conversationId);

    expect(active.engrams.map((e) => e.engramId).toSorted()).toEqual([cluster, rollout].toSorted());
  });

  it('writes an emit report from the lexically matched engrams', async () => {
    let systemPrompt = '';
    let ids: Corpus | undefined;
    const c = client({
      emitLlm: makeFakeGenerationLlm((prompt) => {
        systemPrompt = prompt;
        return `# Karbon\n\nMarch [${ids?.cluster}], by region [${ids?.rollout}].`;
      }),
    });
    ids = await writeCorpus(c);

    const { document } = await c.emit.generateReport({ query: 'karbon migration' });

    expect(document?.sources.map((s) => s.id).toSorted()).toEqual(
      [ids.cluster, ids.rollout].toSorted()
    );
    expect(systemPrompt).toContain('karbon migration happens in March');
    expect(systemPrompt).not.toContain('Sourdough');
  });
});
