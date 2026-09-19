/**
 * Integration tests for `POST /codes/rank` (POPS-4130).
 *
 * Covers the wire contract inventory's `codes/suggest` depends on
 * (`pillars/inventory/src/api/ai/client.ts`): the response is always a
 * permutation of the request's `candidates`, and the route is reachable with
 * no service-account key at all — matching every other ai route's default
 * posture. Scope enforcement itself is covered separately in
 * `service-account-scope.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

function multiset(values: readonly string[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  return tally;
}

const { requestOn } = createTestTransport();

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-codes-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /codes/rank', () => {
  it('answers with a permutation of the candidates it was given', async () => {
    const candidates = ['ABC012', 'ABC010', 'ABC011'];
    const res = await requestOn(app).post('/codes/rank').send({ name: 'Widget', candidates });

    expect(res.status).toBe(200);
    expect(multiset(res.body.ranked)).toEqual(multiset(candidates));
  });

  it('accepts an optional typeKey', async () => {
    const res = await requestOn(app)
      .post('/codes/rank')
      .send({ name: 'Widget', typeKey: 'widget', candidates: ['ABC001'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ranked: ['ABC001'] });
  });

  it('400s an empty candidates array', async () => {
    const res = await requestOn(app).post('/codes/rank').send({ name: 'Widget', candidates: [] });
    expect(res.status).toBe(400);
  });

  it('400s a missing name', async () => {
    const res = await requestOn(app)
      .post('/codes/rank')
      .send({ candidates: ['ABC001'] });
    expect(res.status).toBe(400);
  });

  it('is reachable with no service-account key — the default ADR-044 posture', async () => {
    const res = await requestOn(app)
      .post('/codes/rank')
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(res.status).toBe(200);
  });

  it('is deterministic across repeated calls with the same body', async () => {
    const body = { name: 'Widget', typeKey: 'ABC', candidates: ['ABC012', 'ABC010', 'ABC011'] };
    const first = await requestOn(app).post('/codes/rank').send(body);
    const second = await requestOn(app).post('/codes/rank').send(body);

    expect(second.body).toEqual(first.body);
  });
});
