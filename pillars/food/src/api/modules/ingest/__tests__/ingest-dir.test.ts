import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveFoodIngestRoot } from '../ingest-dir.js';

const ORIGINAL_FOOD_INGEST_DIR = process.env['FOOD_INGEST_DIR'];
const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];

beforeEach(() => {
  delete process.env['FOOD_INGEST_DIR'];
  delete process.env['NODE_ENV'];
});

afterEach(() => {
  if (ORIGINAL_FOOD_INGEST_DIR === undefined) delete process.env['FOOD_INGEST_DIR'];
  else process.env['FOOD_INGEST_DIR'] = ORIGINAL_FOOD_INGEST_DIR;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
});

describe('resolveFoodIngestRoot', () => {
  it('resolves the configured FOOD_INGEST_DIR to an absolute path', () => {
    process.env['FOOD_INGEST_DIR'] = '/data/food/ingest';
    expect(resolveFoodIngestRoot()).toBe(resolve('/data/food/ingest'));
  });

  it('falls back to the relative default outside production', () => {
    expect(resolveFoodIngestRoot()).toBe(resolve('./data/food/ingest'));
  });

  it('fails loud when unset in production instead of using an ephemeral path', () => {
    process.env['NODE_ENV'] = 'production';
    expect(() => resolveFoodIngestRoot()).toThrow(/FOOD_INGEST_DIR is not configured/);
  });

  it('honours an explicit FOOD_INGEST_DIR even in production', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['FOOD_INGEST_DIR'] = '/data/food/ingest';
    expect(resolveFoodIngestRoot()).toBe(resolve('/data/food/ingest'));
  });
});
