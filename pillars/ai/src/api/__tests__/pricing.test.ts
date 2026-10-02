/**
 * Integration tests for the public pricing read `GET /ai-pricing/:p/:m`.
 *
 * Returns the per-Mtok USD `{ input, output }` pair the cross-pillar telemetry
 * wrapper fetches before `computeCostUsd`. Backed by `createPricingCache`, which
 * returns 404 for a provider/model pair without configured pricing. NOT gated by
 * the internal token — callers fetch it cross-pillar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-pricing-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /ai-pricing/:provider/:model', () => {
  it('returns the migrated { input, output } per-Mtok pair', async () => {
    const res = await requestOn(app).get('/ai-pricing/anthropic/claude-haiku-4-5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 1, output: 5 });
  });

  it('uses the seeded Sonnet rate when opening a fresh database', async () => {
    const res = await requestOn(app).get('/ai-pricing/anthropic/claude-sonnet-5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 2, output: 10 });
  });

  it('returns 404 when a provider/model pair has no configured price', async () => {
    const res = await requestOn(app).get('/ai-pricing/unknown/model-x');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'ai.resource.not_found' });
  });

  it('is NOT internal-auth gated (public-readable)', async () => {
    // No x-pops-internal-credential header — must still resolve.
    const res = await requestOn(app).get('/ai-pricing/anthropic/claude-haiku-4-5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 1, output: 5 });
  });
});
