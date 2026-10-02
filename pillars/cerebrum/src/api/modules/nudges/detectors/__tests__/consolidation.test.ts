import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../../db/index.js';
import {
  ANCHOR_VECTOR,
  seedEngramVector,
  seedIndexedEngram,
  unitVectorAtCosine,
} from '../../../../__tests__/vector-fixtures.js';
import { HybridSearchService } from '../../../retrieval/hybrid-search.js';
import { getDefaultNudgeThresholds, type EngramSummary } from '../../types.js';
import { ConsolidationDetector } from '../consolidation.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-consolidation-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seed(id: string, vector: Float32Array, scopes = ['work.notes']): EngramSummary {
  seedIndexedEngram(cerebrumDb, { id, title: id, scopes });
  seedEngramVector(cerebrumDb, id, vector);
  return {
    id,
    type: 'note',
    title: id,
    status: 'active',
    scopes,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
  };
}

function detector(): ConsolidationDetector {
  const search = new HybridSearchService({
    db: cerebrumDb.db,
    raw: cerebrumDb.raw,
    vecAvailable: cerebrumDb.vecAvailable,
    peers: {},
  });
  return new ConsolidationDetector(search, getDefaultNudgeThresholds());
}

describe('ConsolidationDetector', () => {
  it('clusters neighbours at cosine 0.9 and leaves out one at cosine 0.7', async () => {
    const engrams = [
      seed('eng_seed', ANCHOR_VECTOR),
      seed('eng_near_a', unitVectorAtCosine(0.9, 1)),
      seed('eng_near_b', unitVectorAtCosine(0.9, 2)),
      seed('eng_loose', unitVectorAtCosine(0.7, 3)),
    ];

    const { nudges } = await detector().detect(engrams);

    expect(nudges).toHaveLength(1);
    expect(nudges[0]?.engramIds.toSorted()).toEqual(['eng_near_a', 'eng_near_b', 'eng_seed']);
  });

  it('reports the mean cosine of the clustered neighbours in the nudge body', async () => {
    const engrams = [
      seed('eng_seed', ANCHOR_VECTOR),
      seed('eng_near_a', unitVectorAtCosine(0.9, 1)),
      seed('eng_near_b', unitVectorAtCosine(0.96, 2)),
    ];

    const { nudges } = await detector().detect(engrams);

    expect(nudges[0]?.body).toContain('mean cosine similarity to the first: 0.93');
  });

  it('proposes nothing when every neighbour sits below the threshold', async () => {
    const engrams = [
      seed('eng_seed', ANCHOR_VECTOR),
      seed('eng_loose_a', unitVectorAtCosine(0.7, 1)),
      seed('eng_loose_b', unitVectorAtCosine(0.8, 2)),
    ];

    const { nudges } = await detector().detect(engrams);

    expect(nudges).toEqual([]);
  });
});
