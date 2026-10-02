/**
 * Stages a populated ai database through the baseline, then verifies the
 * production opener applies the remaining migrations without losing operator data.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openAiDb } from '../open-ai-db.js';

import type { OpenedAiDb } from '../open-ai-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The only entry in this pillar's journal, as of writing. */
const BASELINE_TAG = '0001_ai_baseline';

const METADATA = { promptTokensDetails: { cached: 128 }, retries: 0, "note's": 'quote "test"' };

let dir: string;
let dbPath: string;
let opened: OpenedAiDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  raw
    .prepare(`INSERT INTO settings (key, value) VALUES ('ai.default-provider', 'anthropic')`)
    .run();
  raw.prepare(`INSERT INTO settings (key, value) VALUES ('ai.empty-flag', '')`).run();

  raw
    .prepare(
      `INSERT INTO ai_providers
         (id, name, type, base_url, api_key_ref, status, last_health_check, last_latency_ms, created_at, updated_at)
       VALUES ('anthropic', 'Anthropic', 'anthropic', NULL, 'secret/ai/anthropic', 'active', NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO ai_inference_log
         (provider, model, operation, domain, input_tokens, output_tokens, cost_usd, latency_ms, status, cached, context_id, error_message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'anthropic',
      'claude-sonnet-5',
      'categorize',
      'finance',
      1024,
      256,
      0.0123,
      842,
      'success',
      0,
      'ctx-woolworths-import',
      null,
      JSON.stringify(METADATA),
      '2026-01-02T03:04:05Z'
    );
  raw
    .prepare(
      `INSERT INTO ai_inference_log
         (provider, model, operation, domain, input_tokens, output_tokens, cost_usd, latency_ms, status, cached, context_id, error_message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'anthropic',
      'claude-sonnet-5',
      'summarize',
      null,
      0,
      0,
      0,
      0,
      'error',
      0,
      null,
      "timeout after 5000ms: connection reset (peer closed 'stream')",
      null,
      '2026-01-02T03:05:00Z'
    );

  raw
    .prepare(
      `INSERT INTO ai_alert_rules
         (id, type, scope_provider, scope_model, threshold_value, window_minutes, enabled, created_at, updated_at)
       VALUES (1, 'cost', 'anthropic', NULL, 25.5, 60, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO ai_alerts
         (id, rule_id, type, message, severity, scope_detail, metric_value, threshold_value, acknowledged, acknowledged_at, created_at)
       VALUES (1, 1, 'cost', 'Anthropic spend exceeded threshold', 'warning', 'anthropic', 30.1, 25.5, 0, NULL, '2026-01-02T04:00:00Z')`
    )
    .run();
  // No rule_id: proves the ON DELETE SET NULL column tolerates NULL on write too.
  raw
    .prepare(
      `INSERT INTO ai_alerts
         (id, rule_id, type, message, severity, scope_detail, metric_value, threshold_value, acknowledged, acknowledged_at, created_at)
       VALUES (2, NULL, 'latency', 'p99 latency spike', 'critical', NULL, 9800, 5000, 1, '2026-01-02T05:00:00Z', '2026-01-02T04:55:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO ai_model_pricing
         (provider_id, model_id, display_name, input_cost_per_mtok, output_cost_per_mtok, context_window, is_default, created_at, updated_at)
       VALUES ('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 3, 15, 1000000, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO ai_budgets
         (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('b-global', 'global', NULL, NULL, 100.5, 'block', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    )
    .run();

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-migration-safety-'));
  dbPath = join(dir, 'ai.db');
  seedThroughBaseline();
  opened = openAiDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated ai database', () => {
  it('applies every journal entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from any seeded table', () => {
    expect(count('settings')).toBe(2);
    expect(count('ai_providers')).toBe(1);
    expect(count('ai_inference_log')).toBe(2);
    expect(count('ai_alert_rules')).toBe(1);
    expect(count('ai_alerts')).toBe(2);
    expect(count('ai_model_pricing')).toBe(7);
    expect(count('ai_budgets')).toBe(1);
  });

  it('seeds Anthropic prices idempotently without replacing operator edits', () => {
    opened.raw
      .prepare(
        "UPDATE ai_model_pricing SET input_cost_per_mtok = 6.5, output_cost_per_mtok = 32.5 WHERE provider_id = 'anthropic' AND model_id = 'claude-sonnet-5'"
      )
      .run();

    const migration = readFileSync(
      join(MIGRATIONS_DIR, '0002_seed_anthropic_model_pricing.sql'),
      'utf8'
    );
    opened.raw.exec(migration);

    expect(count('ai_model_pricing')).toBe(7);
    expect(
      rows<{ input_cost_per_mtok: number; model_id: string; output_cost_per_mtok: number }>(
        "SELECT model_id, input_cost_per_mtok, output_cost_per_mtok FROM ai_model_pricing WHERE provider_id = 'anthropic' ORDER BY model_id"
      )
    ).toEqual([
      { model_id: 'claude-haiku-4-5', input_cost_per_mtok: 1, output_cost_per_mtok: 5 },
      { model_id: 'claude-haiku-4-5-20251001', input_cost_per_mtok: 1, output_cost_per_mtok: 5 },
      { model_id: 'claude-opus-4-8', input_cost_per_mtok: 5, output_cost_per_mtok: 25 },
      { model_id: 'claude-opus-5-5', input_cost_per_mtok: 4, output_cost_per_mtok: 20 },
      { model_id: 'claude-sonnet-4-6', input_cost_per_mtok: 3, output_cost_per_mtok: 15 },
      { model_id: 'claude-sonnet-5', input_cost_per_mtok: 6.5, output_cost_per_mtok: 32.5 },
      { model_id: 'claude-sonnet-5-5', input_cost_per_mtok: 2, output_cost_per_mtok: 10 },
    ]);
  });

  it('leaves the pre-migration snapshot behind only if it failed', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });

  it('keeps the alert-to-rule foreign key and its SET NULL sibling intact', () => {
    const stored = rows<{ id: number; rule_id: number | null }>(
      `SELECT id, rule_id FROM ai_alerts ORDER BY id`
    );
    expect(stored).toEqual([
      { id: 1, rule_id: 1 },
      { id: 2, rule_id: null },
    ]);
  });

  it('leaves the JSON metadata column parseable and unchanged', () => {
    const stored = rows<{ metadata: string | null }>(
      `SELECT metadata FROM ai_inference_log WHERE context_id = 'ctx-woolworths-import'`
    );
    expect(stored).toHaveLength(1);
    const metadata = stored[0]?.metadata;
    expect(metadata).not.toBeNull();
    expect(() => JSON.parse(metadata as string) as unknown).not.toThrow();
    expect(JSON.parse(metadata as string)).toEqual(METADATA);
  });

  it('keeps a null metadata column null, not coerced to a string', () => {
    const stored = rows<{ metadata: string | null }>(
      `SELECT metadata FROM ai_inference_log WHERE operation = 'summarize'`
    );
    expect(stored).toEqual([{ metadata: null }]);
  });

  it('preserves error messages and settings values with embedded quotes verbatim', () => {
    const errorRow = rows<{ error_message: string }>(
      `SELECT error_message FROM ai_inference_log WHERE operation = 'summarize'`
    )[0];
    expect(errorRow?.error_message).toBe(
      "timeout after 5000ms: connection reset (peer closed 'stream')"
    );

    const empty = rows<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'ai.empty-flag'`
    )[0];
    expect(empty?.value).toBe('');
  });

  it('keeps every numeric and boolean-as-integer column exact', () => {
    const stored = rows<{
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      cached: number;
    }>(
      `SELECT input_tokens, output_tokens, cost_usd, cached FROM ai_inference_log WHERE context_id = 'ctx-woolworths-import'`
    )[0];
    expect(stored).toEqual({
      input_tokens: 1024,
      output_tokens: 256,
      cost_usd: 0.0123,
      cached: 0,
    });
  });

  it('is idempotent: reopening an already-migrated database changes nothing', () => {
    const before = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    opened.raw.close();
    opened = openAiDb(dbPath);
    const after = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(after).toEqual(before);
    expect(count('ai_inference_log')).toBe(2);
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });
});
