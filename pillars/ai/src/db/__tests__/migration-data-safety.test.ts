/**
 * What the migration chain does to data that was already there.
 *
 * The companion test in finance and purchases stages a database up to the
 * entry *before* a data-mutating migration, seeds it, then reopens with the
 * real opener to prove the rest of the journal doesn't lose or mangle rows.
 * The ai pillar's journal currently holds exactly one entry —
 * `0001_ai_baseline` — so there is no earlier point to stage from and no tail
 * migration to test against yet.
 *
 * What this test proves today is narrower: staging through the only entry
 * that exists, seeding representative rows, and reopening with `openAiDb`
 * shows the opener is idempotent against an already-migrated, populated
 * database (no spurious pre-migration snapshot, no rewritten row), and that
 * `PRAGMA foreign_key_check` / `integrity_check` are clean against this
 * schema. It does not yet prove anything about a migration rewriting
 * existing data, because none exists. The moment a second migration lands,
 * `BASELINE_TAG` stays `0001_ai_baseline`, the seed below becomes the "before"
 * state, and this test starts covering the same ground finance's and
 * purchases's do.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
    expect(count('ai_model_pricing')).toBe(1);
    expect(count('ai_budgets')).toBe(1);
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
