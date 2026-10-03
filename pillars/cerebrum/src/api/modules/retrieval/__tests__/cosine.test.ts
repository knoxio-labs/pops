import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import {
  ANCHOR_VECTOR,
  seedEngramVector,
  seedIndexedEngram,
  unitVectorAtCosine,
} from '../../../__tests__/vector-fixtures.js';
import { cosineToMaxL2, l2ToCosine } from '../cosine.js';
import { knnQuery } from '../semantic-search-helpers.js';

describe('l2ToCosine', () => {
  it.each([
    [0, 1],
    [1, 0.5],
    [Math.SQRT2, 0],
    [2, -1],
  ])('maps L2 distance %d to cosine %d', (distance, cosine) => {
    expect(l2ToCosine(distance)).toBeCloseTo(cosine, 12);
  });

  it('puts the L2 ceilings the pillar used to pass at the cosines they really demanded', () => {
    expect(l2ToCosine(0.3)).toBeCloseTo(0.955, 12);
    expect(l2ToCosine(0.2)).toBeCloseTo(0.98, 12);
    expect(l2ToCosine(0.85)).toBeCloseTo(0.63875, 12);
  });
});

describe('cosineToMaxL2', () => {
  it.each([
    [1, 0],
    [0.5, 1],
    [0, Math.SQRT2],
    [-1, 2],
    [0.85, 0.5477225575051661],
    [0.3, 1.1832159566199232],
  ])('maps minimum cosine %d to L2 ceiling %d', (minCosine, maxDistance) => {
    expect(cosineToMaxL2(minCosine)).toBeCloseTo(maxDistance, 12);
  });

  it('admits nothing beyond distance 0 for a cosine above 1', () => {
    expect(cosineToMaxL2(1.5)).toBe(0);
  });

  it.each([-1, -0.25, 0, 0.3, 0.35, 0.7, 0.85, 1])('inverts l2ToCosine at cosine %d', (cosine) => {
    expect(l2ToCosine(cosineToMaxL2(cosine))).toBeCloseTo(cosine, 12);
  });
});

describe('sqlite-vec distance for unit vectors', () => {
  let tmpDir: string;
  let cerebrumDb: OpenedCerebrumDb;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-cosine-test-'));
    cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
  });

  afterEach(() => {
    cerebrumDb.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each([0.9, 0.5, 0.3, 0])('reports the L2 distance of a neighbour at cosine %d', (cosine) => {
    expect(cerebrumDb.vecAvailable).toBe(true);
    seedIndexedEngram(cerebrumDb, { id: 'eng_20260101_0000_n', title: 'Neighbour' });
    seedEngramVector(cerebrumDb, 'eng_20260101_0000_n', unitVectorAtCosine(cosine, 1));

    const [row] = knnQuery(cerebrumDb.raw, ANCHOR_VECTOR, 1);

    expect(row?.distance).toBeCloseTo(cosineToMaxL2(cosine), 5);
    expect(l2ToCosine(row?.distance ?? Number.NaN)).toBeCloseTo(cosine, 5);
  });
});
