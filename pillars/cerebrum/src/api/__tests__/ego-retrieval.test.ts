/**
 * What an ego turn retrieves, against real sqlite-vec vectors: the engrams it
 * pulls into context are the ones the turn's active context reports.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeCerebrumApiDeps, makeClient, makeFakeEgoLlm } from './test-utils.js';
import {
  anchorEmbeddingClient,
  seedEngramVector,
  seedIndexedEngram,
  unitVectorAtCosine,
} from './vector-fixtures.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-retrieval-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-retrieval-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client(withEmbeddings = true) {
  return makeClient(
    createCerebrumApiApp(
      makeCerebrumApiDeps(
        { cerebrumDb, tmpDir, engramRoot },
        {
          egoLlm: makeFakeEgoLlm('Canned ego reply.'),
          embeddingClient: withEmbeddings ? anchorEmbeddingClient() : undefined,
        }
      )
    )
  );
}

function seed(id: string, cosine: number, offAxis: number): void {
  seedIndexedEngram(cerebrumDb, { id, title: id, scopes: ['work.notes'] });
  seedEngramVector(cerebrumDb, id, unitVectorAtCosine(cosine, offAxis));
}

async function contextEngramIds(c: ReturnType<typeof client>, message: string): Promise<string[]> {
  const turn = await c.ego.chat({ message, scopes: ['work.notes'] });
  expect(turn.response.content).toBe('Canned ego reply.');
  const active = await c.ego.getActiveContext(turn.conversationId);
  return active.engrams.map((e) => e.engramId);
}

describe('ego chat retrieval', () => {
  it('pulls in an engram at cosine 0.5 to the message and leaves out one at 0.1', async () => {
    seed('eng_20260101_0001_related', 0.5, 1);
    seed('eng_20260101_0002_unrelated', 0.1, 2);

    expect(await contextEngramIds(client(), 'what did we decide?')).toEqual([
      'eng_20260101_0001_related',
    ]);
  });

  it('answers with no engram context when nothing is close to the message', async () => {
    seed('eng_20260101_0002_unrelated', 0.1, 1);

    expect(await contextEngramIds(client(), 'what did we decide?')).toEqual([]);
  });

  it('answers with no engram context when no embedding client is configured', async () => {
    seed('eng_20260101_0001_related', 0.9, 1);

    expect(await contextEngramIds(client(false), 'what did we decide?')).toEqual([]);
  });
});
