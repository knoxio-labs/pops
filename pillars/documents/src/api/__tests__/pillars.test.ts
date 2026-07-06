/**
 * Smoke tests for the `GET /pillars` registry endpoint.
 *
 * Covers the synthetic-`documents`-entry contract, deduplication when the
 * env already lists `documents`, and a malformed POPS_PILLARS returning 500
 * (since the parser is strict by design).
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDocumentsApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

const originalPillars = process.env['POPS_PILLARS'];

beforeEach(() => {
  delete process.env['POPS_PILLARS'];
  __resetPillarRegistryCache();
});

afterEach(() => {
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
  __resetPillarRegistryCache();
});

function makeApp(): ReturnType<typeof createDocumentsApiApp> {
  return createDocumentsApiApp({
    version: '0.0.1-test',
    selfBaseUrl: 'http://documents-api:3012',
  });
}

describe('GET /pillars', () => {
  it('returns the synthetic documents entry when POPS_PILLARS is unset', async () => {
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [{ id: 'documents', baseUrl: 'http://documents-api:3012' }],
    });
  });

  it('merges the synthetic documents entry ahead of POPS_PILLARS-parsed siblings', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000,finance:http://finance-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [
        { id: 'documents', baseUrl: 'http://documents-api:3012' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
        { id: 'finance', baseUrl: 'http://finance-api:3000' },
      ],
    });
  });

  it('overrides a POPS_PILLARS `documents` entry with the live selfBaseUrl', async () => {
    process.env['POPS_PILLARS'] = 'documents:http://stale-documents:9000,food:http://food-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.body).toEqual({
      pillars: [
        { id: 'documents', baseUrl: 'http://documents-api:3012' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
      ],
    });
  });

  it('returns 500 on a malformed POPS_PILLARS', async () => {
    process.env['POPS_PILLARS'] = 'no-colon-here';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });
});
