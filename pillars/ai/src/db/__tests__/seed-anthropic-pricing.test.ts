/**
 * The `0002_seed_anthropic_model_pricing` migration must populate every model
 * POPS sends, store USD per million tokens, and never overwrite a price that
 * was edited by hand before (or after) it ran.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiModelPricing, openAiDb, type OpenedAiDb } from '../index.js';

const SEED_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0002_seed_anthropic_model_pricing.sql'
  ),
  'utf8'
);

const EXPECTED: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

let tmpDir: string;
let aiDb: OpenedAiDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-seed-pricing-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function rows() {
  return aiDb.db.select().from(aiModelPricing).all();
}

describe('anthropic pricing seed', () => {
  it('populates every model under provider anthropic on a fresh database', () => {
    const seeded = Object.fromEntries(
      rows()
        .filter((row) => row.providerId === 'anthropic')
        .map((row) => [row.modelId, { input: row.inputCostPerMtok, output: row.outputCostPerMtok }])
    );
    expect(seeded).toEqual(EXPECTED);
    expect(rows()).toHaveLength(Object.keys(EXPECTED).length);
  });

  it('is idempotent when re-run', () => {
    aiDb.raw.exec(SEED_SQL);
    aiDb.raw.exec(SEED_SQL);
    expect(rows()).toHaveLength(Object.keys(EXPECTED).length);
  });

  it('does not overwrite a hand-edited price when re-run', () => {
    aiDb.raw.exec(
      `UPDATE ai_model_pricing SET input_cost_per_mtok = 99, output_cost_per_mtok = 98 WHERE model_id = 'claude-sonnet-4-6'`
    );
    aiDb.raw.exec(SEED_SQL);
    const edited = rows().find((row) => row.modelId === 'claude-sonnet-4-6');
    expect(edited).toMatchObject({ inputCostPerMtok: 99, outputCostPerMtok: 98 });
  });

  it('leaves unrelated providers untouched', () => {
    const now = new Date().toISOString();
    aiDb.db
      .insert(aiModelPricing)
      .values({
        providerId: 'ollama',
        modelId: 'llama3:8b',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    aiDb.raw.exec(SEED_SQL);
    expect(rows().filter((row) => row.providerId === 'ollama')).toHaveLength(1);
  });
});
