/**
 * Integration tests for the ai pillar's own `settings.*` RU+reset surface,
 * served from the `settings` table in `ai.db` via `@pops/pillar-settings`.
 *
 * Confirms the ai pillar OWNS serving its `ai.*` keys (per-pillar settings
 * ownership): `list` resolves manifest defaults, writes round-trip, a reset
 * restores the manifest default, and a key outside the declared `ai.*` set is
 * rejected at the contract boundary.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-settings-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ai pillar settings RU+reset', () => {
  it('list resolves the manifest default for an unset key', async () => {
    const res = await requestOn(app).get('/settings');
    expect(res.status).toBe(200);
    const rows = res.body.data as { key: string; value: string }[];
    expect(rows).toContainEqual({ key: 'ai.budgetExceededFallback', value: 'skip' });
    expect(rows).toContainEqual({ key: 'ai.logRetentionDays', value: '90' });
    expect(rows.map((r) => r.key).filter((k) => k.startsWith('ai.model'))).toEqual([]);
  });

  it('get returns null for an unset key (no default at the single-key read)', async () => {
    const res = await requestOn(app).get('/settings/ai.budgetExceededFallback');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('round-trips a write then read', async () => {
    const put = await requestOn(app)
      .put('/settings/ai.monthlyTokenBudget')
      .send({ value: '50000' });
    expect(put.status).toBe(200);

    const get = await requestOn(app).get('/settings/ai.monthlyTokenBudget');
    expect(get.body.data).toEqual({ key: 'ai.monthlyTokenBudget', value: '50000' });
  });

  it('resets a key back to its manifest default', async () => {
    await requestOn(app).put('/settings/ai.budgetExceededFallback').send({ value: 'alert' });
    const reset = await requestOn(app).post('/settings/ai.budgetExceededFallback/reset').send({});
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ key: 'ai.budgetExceededFallback', value: 'skip' });
  });

  it('rejects the removed ai.model keys at the contract boundary', async () => {
    expect((await requestOn(app).get('/settings/ai.model')).status).toBe(400);
    expect((await requestOn(app).get('/settings/ai.modelOverrides.query')).status).toBe(400);
  });

  it('rejects a key outside the declared ai.* set at the contract boundary', async () => {
    const res = await requestOn(app).get('/settings/core.plexUrl');
    expect(res.status).toBe(400);
  });
});
