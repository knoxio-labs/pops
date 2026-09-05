/**
 * Smoke tests for the standalone `openFinanceDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * The journal is self-bootstrapping: `0053_finance_pillar_baseline`
 * creates the tables the 0025/0026/0027/0052 entries ALTER or recreate,
 * mirroring inventory's `0006_inventory_pillar_baseline` mechanism.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '../open-finance-db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openFinanceDb', () => {
  it('creates the parent directory and applies PRAGMAs', () => {
    const path = join(tmpDir, 'nested', 'sub', 'finance.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openFinanceDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the package journal — finance tables exist post-open, entities dropped', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      const tables = raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('wish_list', 'entities', 'transaction_corrections', 'budgets', 'tag_vocabulary', 'transaction_tag_rules') ORDER BY name"
        )
        .all() as { name: string }[];
      // `entities` is intentionally absent — the mirror was dropped in 0057 once
      // entities moved to the contacts pillar.
      expect(tables.map((t) => t.name)).toEqual([
        'budgets',
        'tag_vocabulary',
        'transaction_corrections',
        'transaction_tag_rules',
        'wish_list',
      ]);
    } finally {
      raw.close();
    }
  });

  it('creates the re-homed ai_usage table + indexes (0058, gap #3489)', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      const table = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'ai_usage'")
        .get();
      expect(table).toBeDefined();

      const indexes = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(indexes.has('idx_ai_usage_created_at')).toBe(true);
      expect(indexes.has('idx_ai_usage_batch')).toBe(true);
    } finally {
      raw.close();
    }
  });

  it('drops the entities mirror table and its FK constraints (0057)', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      const entities = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'entities'")
        .get();
      expect(entities).toBeUndefined();

      // The entity_id FK on transactions/corrections/tag-rules is gone — a row
      // referencing a non-local (contacts) entity id now inserts cleanly.
      // Asserted per-column rather than as "no FKs at all": corrections gained
      // an unrelated account_id FK in 0094, and an emptiness check would have
      // read that as the entity mirror coming back.
      for (const table of ['transaction_corrections', 'transaction_tag_rules']) {
        const fks = raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
          from: string;
        }[];
        expect(fks.find((fk) => fk.from === 'entity_id')).toBeUndefined();
      }

      // The 0094 account scope is a real FK onto accounts, not free text
      // (POPS-2593).
      const correctionFks = raw
        .prepare('PRAGMA foreign_key_list(transaction_corrections)')
        .all() as {
        from: string;
        table: string;
      }[];
      expect(correctionFks.find((fk) => fk.from === 'account_id')?.table).toBe('accounts');

      // transactions keeps the 0083 account_id → accounts FK and the 0093
      // import_batch_id → import_batches link — no trace of the dropped
      // entity_id FK.
      const transactionsFks = raw.prepare('PRAGMA foreign_key_list(transactions)').all() as {
        from: string;
        table: string;
      }[];
      expect(transactionsFks.find((fk) => fk.from === 'entity_id')).toBeUndefined();
      expect(transactionsFks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'account_id', table: 'accounts' }),
          expect.objectContaining({ from: 'import_batch_id', table: 'import_batches' }),
        ])
      );
      expect(transactionsFks).toHaveLength(2);
    } finally {
      raw.close();
    }
  });

  it('applies the 0027 priority ALTERs cleanly on top of the baseline', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      // 0027 adds `priority integer DEFAULT 0 NOT NULL` to both tables
      // ALTERed on top of the baseline. Confirm the column lands.
      const correctionsCols = raw.prepare('PRAGMA table_info(transaction_corrections)').all() as {
        name: string;
      }[];
      const rulesCols = raw.prepare('PRAGMA table_info(transaction_tag_rules)').all() as {
        name: string;
      }[];
      expect(correctionsCols.map((c) => c.name)).toContain('priority');
      expect(rulesCols.map((c) => c.name)).toContain('priority');
    } finally {
      raw.close();
    }
  });

  it('adds the nullable match-provenance columns (0060, CF057/#3658)', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      const columns = raw.prepare('PRAGMA table_info(transactions)').all() as {
        name: string;
        notnull: number;
      }[];
      const byName = new Map(columns.map((c) => [c.name, c]));
      expect(byName.get('match_type')?.notnull).toBe(0);
      expect(byName.get('match_rule_id')?.notnull).toBe(0);
      expect(byName.get('match_confidence')?.notnull).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'finance.db');

    const first = openFinanceDb(path);
    let firstCount: number;
    try {
      first.raw
        .prepare("INSERT INTO tag_vocabulary (tag, source, is_active) VALUES ('Custom', 'test', 1)")
        .run();
      firstCount = (
        first.raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get() as { n: number }
      ).n;
    } finally {
      first.raw.close();
    }

    const second = openFinanceDb(path);
    try {
      const secondCount = (
        second.raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get() as { n: number }
      ).n;
      expect(secondCount).toBe(firstCount);
    } finally {
      second.raw.close();
    }
  });
});
