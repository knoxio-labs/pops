/**
 * The consolidator and linker over REST, against real sqlite-vec vectors.
 *
 * Engrams are created through the wire `engrams.create`, then given vectors at
 * a chosen cosine to the first one, so each run decides on the similarity the
 * worker's config names.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeCerebrumApiDeps, makeClient } from './test-utils.js';
import { ANCHOR_VECTOR, seedEngramVector, unitVectorAtCosine } from './vector-fixtures.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-workers-sim-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-workers-sim-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client() {
  return makeClient(createCerebrumApiApp(makeCerebrumApiDeps({ cerebrumDb, tmpDir, engramRoot })));
}

async function createWithVector(
  c: ReturnType<typeof client>,
  title: string,
  vector: Float32Array
): Promise<string> {
  const { engram } = await c.engrams.create({
    type: 'note',
    title,
    body: `${title} body`,
    scopes: ['work.notes'],
  });
  seedEngramVector(cerebrumDb, engram.id, vector);
  return engram.id;
}

describe('runConsolidator', () => {
  it('clusters engrams at cosine 0.9 to a shared neighbour and leaves out one at 0.7', async () => {
    const c = client();
    const seed = await createWithVector(c, 'Seed', ANCHOR_VECTOR);
    const nearA = await createWithVector(c, 'Near A', unitVectorAtCosine(0.9, 1));
    const nearB = await createWithVector(c, 'Near B', unitVectorAtCosine(0.9, 2));
    const loose = await createWithVector(c, 'Loose', unitVectorAtCosine(0.7, 3));

    const result = await c.workers.runConsolidator(true);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.affectedIds.toSorted()).toEqual([seed, nearA, nearB].toSorted());
    expect(result.actions[0]?.affectedIds).not.toContain(loose);
  });
});

describe('runLinker', () => {
  it('proposes a link at cosine 0.8, reports that cosine, and skips a neighbour at 0.5', async () => {
    const c = client();
    const seed = await createWithVector(c, 'Seed', ANCHOR_VECTOR);
    const related = await createWithVector(c, 'Related', unitVectorAtCosine(0.8, 1));
    const distant = await createWithVector(c, 'Distant', unitVectorAtCosine(0.5, 2));

    const result = await c.workers.runLinker(true);

    expect(result.actions).toHaveLength(1);
    const [action] = result.actions;
    expect(action?.affectedIds.toSorted()).toEqual([seed, related].toSorted());
    expect(action?.affectedIds).not.toContain(distant);
    expect(action?.payload['similarityScore']).toBeCloseTo(0.8, 5);
  });
});
