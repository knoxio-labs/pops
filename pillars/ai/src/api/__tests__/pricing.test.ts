/**
 * Integration tests for the public pricing read `GET /ai-pricing/:p/:m`.
 *
 * Returns the per-Mtok USD `{ input, output }` pair the cross-pillar telemetry
 * wrapper fetches before `computeCostUsd`. Backed by `createPricingCache`; an
 * unpriced pair answers 404 so no price is fabricated. NOT gated by
 * the internal token — callers fetch it cross-pillar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiModelPricing, openAiDb, type OpenedAiDb } from '../../db/index.js';
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
  it('returns the seeded { input, output } per-Mtok pair', async () => {
    const now = new Date().toISOString();
    aiDb.db
      .insert(aiModelPricing)
      .values({
        providerId: 'claude',
        modelId: 'claude-haiku-4-5',
        inputCostPerMtok: 0.8,
        outputCostPerMtok: 4,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const res = await requestOn(app).get('/ai-pricing/claude/claude-haiku-4-5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 0.8, output: 4 });
  });

  it('404s for an unknown provider/model instead of inventing a price', async () => {
    const res = await requestOn(app).get('/ai-pricing/unknown/model-x');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ai.resource.not_found');
    expect(res.body).not.toHaveProperty('input');
  });

  it('404s for a known model under the wrong provider id', async () => {
    const res = await requestOn(app).get('/ai-pricing/claude/claude-sonnet-4-6');
    expect(res.status).toBe(404);
  });

  it('serves the seeded anthropic rows with their USD per-Mtok prices', async () => {
    const sonnet = await requestOn(app).get('/ai-pricing/anthropic/claude-sonnet-4-6');
    expect(sonnet.status).toBe(200);
    expect(sonnet.body).toEqual({ input: 3, output: 15 });
    const haiku = await requestOn(app).get('/ai-pricing/anthropic/claude-haiku-4-5-20251001');
    expect(haiku.body).toEqual({ input: 1, output: 5 });
  });

  it('is NOT internal-auth gated (public-readable)', async () => {
    const res = await requestOn(app).get('/ai-pricing/anthropic/claude-opus-4-8');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 5, output: 25 });
  });
});
