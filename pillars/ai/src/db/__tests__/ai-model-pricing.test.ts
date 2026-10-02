/**
 * Invariant tests for the ai-model-pricing cache against an in-memory
 * SQLite. The `ai_model_pricing` schema is booted inline here rather
 * than from the pillar migration so the cache contract is exercised in
 * isolation from the rest of the baseline schema.
 *
 * Cache-hit + cache-miss + TTL invalidation + DB-error propagation are
 * driven via the `now` injection point so the test is deterministic
 * without sleeping.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiModelPricing } from '../schema.js';
import { createPricingCache } from '../services/ai-model-pricing.js';

import type { AiDb } from '../services/internal.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE ai_model_pricing (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    display_name text,
    input_cost_per_mtok real DEFAULT 0 NOT NULL,
    output_cost_per_mtok real DEFAULT 0 NOT NULL,
    context_window integer,
    is_default integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE(provider_id, model_id)
  );
`;

function freshDb(): { db: AiDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(CREATE_TABLE_SQL);
  return { db: drizzle(raw), raw };
}

function seedAnthropic(db: AiDb): void {
  db.insert(aiModelPricing)
    .values({
      providerId: 'anthropic',
      modelId: 'sonnet-4-5',
      displayName: 'Claude Sonnet 4.5',
      inputCostPerMtok: 3.0,
      outputCostPerMtok: 15.0,
      contextWindow: 200_000,
      isDefault: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
    .run();
}

describe('createPricingCache', () => {
  let db: AiDb;
  let raw: Database.Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('lookup', () => {
    it('returns the persisted cost-per-Mtok pair on first call (cache miss -> DB refresh)', () => {
      seedAnthropic(db);
      const cache = createPricingCache(db);
      expect(cache.lookup('anthropic', 'sonnet-4-5')).toEqual({ input: 3.0, output: 15.0 });
    });

    it('returns null for an unknown provider/model pair', () => {
      seedAnthropic(db);
      const cache = createPricingCache(db);
      expect(cache.lookup('anthropic', 'unknown-model')).toBeNull();
    });

    it('serves a cache hit without re-reading the DB while within the TTL window', () => {
      seedAnthropic(db);
      const selectSpy = vi.spyOn(db, 'select');
      const cache = createPricingCache(db, { ttlMs: 1_000, now: () => 1_000 });
      expect(cache.lookup('anthropic', 'sonnet-4-5')).toEqual({ input: 3.0, output: 15.0 });
      const callsAfterFirst = selectSpy.mock.calls.length;
      expect(cache.lookup('anthropic', 'sonnet-4-5')).toEqual({ input: 3.0, output: 15.0 });
      expect(selectSpy.mock.calls.length).toBe(callsAfterFirst);
    });

    it('treats an entry older than the TTL as a miss and re-reads the DB', () => {
      seedAnthropic(db);
      let now = 1_000;
      const cache = createPricingCache(db, { ttlMs: 1_000, now: () => now });
      cache.lookup('anthropic', 'sonnet-4-5');
      const selectSpy = vi.spyOn(db, 'select');

      now = 1_500;
      cache.lookup('anthropic', 'sonnet-4-5');
      expect(selectSpy).not.toHaveBeenCalled();

      now = 2_500;
      cache.lookup('anthropic', 'sonnet-4-5');
      expect(selectSpy).toHaveBeenCalledTimes(1);
    });

    it('picks up pricing edits on the next miss after the TTL expires', () => {
      seedAnthropic(db);
      let now = 0;
      const cache = createPricingCache(db, { ttlMs: 1_000, now: () => now });
      expect(cache.lookup('anthropic', 'sonnet-4-5')?.input).toBe(3.0);

      raw.exec(`UPDATE ai_model_pricing SET input_cost_per_mtok = 4.0`);

      now = 5_000;
      expect(cache.lookup('anthropic', 'sonnet-4-5')?.input).toBe(4.0);
    });

    it('propagates a database refresh error', () => {
      const cache = createPricingCache(db);
      vi.spyOn(db, 'select').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      expect(() => cache.lookup('anthropic', 'sonnet-4-5')).toThrow('boom');
    });
  });

  describe('clear', () => {
    it('drops the cache so the next lookup triggers a DB refresh', () => {
      seedAnthropic(db);
      const cache = createPricingCache(db, { ttlMs: 60_000 });
      cache.lookup('anthropic', 'sonnet-4-5');
      cache.clear();
      const selectSpy = vi.spyOn(db, 'select');
      cache.lookup('anthropic', 'sonnet-4-5');
      expect(selectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
