/**
 * What the tail of the registry migration chain does to data that was
 * already there.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a `DROP TABLE` that takes a surviving table down with
 * it, or a rebuild that loses a row, passes all of them and is discovered
 * against the live file. The two migrations most likely to do that are
 * `0069_drop_entities` and `0070_drop_ai_usage` — both plain `DROP TABLE IF
 * EXISTS` statements with no rebuild, run back to back at the end of the
 * journal.
 *
 * The shape: bring a database up to `0068_pillar_registry_capabilities` —
 * the last entry before the two drops — from a truncated journal, write
 * representative rows through raw SQL, then reopen it with the real opener,
 * which applies the rest. `entities` and `ai_usage` must be gone afterwards;
 * everything else, including the `ai_alerts` → `ai_alert_rules` foreign key
 * and `pillar_registry`'s two JSON columns, must be untouched.
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

import { openCoreDb } from '../open-core-db.js';

import type { OpenedCoreDb } from '../open-core-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry before `0069_drop_entities` and `0070_drop_ai_usage`. */
const BASELINE_TAG = '0068_pillar_registry_capabilities';

const MANIFEST = { routes: ['/health', '/register'], version: '3.4.1' };
const CAPABILITIES = { 'finance.categorize': 'up', 'finance.import': 'down' };

let dir: string;
let dbPath: string;
let opened: OpenedCoreDb;

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
    .prepare(
      `INSERT INTO entities
         (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time, owner_uri)
       VALUES ('e-woolworths', 'Woolworths', 'company', NULL, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z', 'urn:contacts:e-woolworths')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO ai_usage
         (description, entity_name, category, input_tokens, output_tokens, cost_usd, cached, import_batch_id, created_at)
       VALUES ('WOOLWORTHS 1234', 'Woolworths', 'groceries', 120, 40, 0.0032, 0, 'batch-1', '2026-01-02T00:00:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO service_accounts
         (id, name, key_prefix, key_hash, scopes, created_at, last_used_at, revoked_at, created_by)
       VALUES ('sa-orchestrator', 'orchestrator', 'sk_live_ab', 'hash-1', '["registry:read","registry:write"]', '2026-01-01T00:00:00Z', NULL, NULL, 'operator')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO pillar_registry
         (pillar_id, base_url, manifest_json, contract_package, contract_version, contract_tag,
          registered_at, last_heartbeat_at, status, status_updated_at, capabilities_json,
          origin, api_key_hash, evicted_at)
       VALUES ('finance', 'http://finance.local:4001', ?, '@pops/finance-contract', '1.4.0', 'v1',
               '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 'up', '2026-01-01T00:05:00Z', ?,
               'internal', NULL, NULL)`
    )
    .run(JSON.stringify(MANIFEST), JSON.stringify(CAPABILITIES));

  const ruleId = (
    raw
      .prepare(
        `INSERT INTO ai_alert_rules
           (type, scope_provider, scope_model, threshold_value, window_minutes, enabled, created_at, updated_at)
         VALUES ('budget-threshold', NULL, NULL, 80, 60, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
         RETURNING id`
      )
      .get() as { id: number }
  ).id;
  raw
    .prepare(
      `INSERT INTO ai_alerts
         (rule_id, type, message, severity, scope_detail, metric_value, threshold_value, acknowledged, acknowledged_at, created_at)
       VALUES (?, 'budget-threshold', 'over budget', 'warning', 'budget:global', 81, 80, 0, NULL, '2026-01-02T00:00:00Z')`
    )
    .run(ruleId);

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function single<T>(sql: string): T {
  const found = rows<T>(sql)[0];
  if (found === undefined) {
    throw new Error(`expected exactly one row from: ${sql}`);
  }
  return found;
}

function tableExists(name: string): boolean {
  return (
    opened.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) !== undefined
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'registry-migration-safety-'));
  dbPath = join(dir, 'core.db');
  seedThroughBaseline();
  opened = openCoreDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated registry database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('leaves no pre-migration snapshot behind', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('drops entities and ai_usage as tables, not just their rows', () => {
    expect(tableExists('entities')).toBe(false);
    expect(tableExists('ai_usage')).toBe(false);
  });

  it('takes nothing else down with the two drops', () => {
    expect(count('service_accounts')).toBe(1);
    expect(count('pillar_registry')).toBe(1);
    expect(count('ai_alert_rules')).toBe(1);
    expect(count('ai_alerts')).toBe(1);
  });

  it('leaves the service account row byte-identical', () => {
    const stored = rows<{
      id: string;
      name: string;
      key_prefix: string;
      key_hash: string;
      scopes: string;
      created_by: string;
    }>(`SELECT id, name, key_prefix, key_hash, scopes, created_by FROM service_accounts`);
    expect(stored).toEqual([
      {
        id: 'sa-orchestrator',
        name: 'orchestrator',
        key_prefix: 'sk_live_ab',
        key_hash: 'hash-1',
        scopes: '["registry:read","registry:write"]',
        created_by: 'operator',
      },
    ]);
  });

  it('round-trips both JSON columns on pillar_registry', () => {
    const stored = single<{ manifest_json: string; capabilities_json: string }>(
      `SELECT manifest_json, capabilities_json FROM pillar_registry WHERE pillar_id = 'finance'`
    );
    expect(JSON.parse(stored.manifest_json)).toEqual(MANIFEST);
    expect(JSON.parse(stored.capabilities_json)).toEqual(CAPABILITIES);
  });

  it('keeps every non-JSON pillar_registry column intact', () => {
    const stored = single<{
      base_url: string;
      contract_package: string;
      contract_version: string;
      status: string;
      origin: string;
    }>(
      `SELECT base_url, contract_package, contract_version, status, origin
       FROM pillar_registry WHERE pillar_id = 'finance'`
    );
    expect(stored).toEqual({
      base_url: 'http://finance.local:4001',
      contract_package: '@pops/finance-contract',
      contract_version: '1.4.0',
      status: 'up',
      origin: 'internal',
    });
  });

  it('keeps the ai_alerts row attached to its rule', () => {
    const stored = rows<{ type: string; message: string; rule_type: string }>(
      `SELECT a.type, a.message, r.type AS rule_type
       FROM ai_alerts a JOIN ai_alert_rules r ON r.id = a.rule_id`
    );
    expect(stored).toEqual([
      { type: 'budget-threshold', message: 'over budget', rule_type: 'budget-threshold' },
    ]);
  });

  it('leaves no broken foreign key and no corrupted page', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
