/**
 * The drizzle table definitions and the committed migration are two
 * independent descriptions of the same database. `drizzle-kit generate`
 * produced the migration once, but there is no generate step in this repo's
 * build or CI (see the "Database Management" note in the root `mise.toml`),
 * so nothing stops the two from diverging afterwards: a column added to
 * `src/db/schema/*.ts` without a matching migration edit would typecheck,
 * pass every test that doesn't touch it, and fail in production on the first
 * INSERT.
 *
 * This test closes that gap by introspecting the migrated database and
 * diffing it against the drizzle definitions in both directions.
 */
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devices, pairingCodes, refreshTokens } from '../schema.js';
import { openTempDb } from './helpers.js';

import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

const ALL_TABLES: readonly SQLiteTable[] = [devices, pairingCodes, refreshTokens];

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function columnsOf(table: string): ColumnInfo[] {
  return opened.raw.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function ddlOf(table: string): string {
  const row = opened.raw
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql: string } | undefined;
  return row?.sql ?? '';
}

describe('every drizzle table exists in the migrated database', () => {
  for (const table of ALL_TABLES) {
    const { name } = getTableConfig(table);

    it(`${name} exists with every declared column`, () => {
      const live = columnsOf(name);
      expect(live.length, `table ${name} is missing from the migration`).toBeGreaterThan(0);

      const liveNames = new Set(live.map((c) => c.name));
      const declared = getTableConfig(table).columns.map((c) => c.name);
      const missing = declared.filter((c) => !liveNames.has(c));
      expect(missing, `${name}: declared in drizzle but absent from the migration`).toEqual([]);
    });

    it(`${name} has no columns the drizzle schema does not declare`, () => {
      const declared = new Set(getTableConfig(table).columns.map((c) => c.name));
      const extra = columnsOf(name)
        .map((c) => c.name)
        .filter((c) => !declared.has(c));
      expect(extra, `${name}: present in the migration but undeclared in drizzle`).toEqual([]);
    });

    it(`${name} agrees with drizzle on which columns are NOT NULL`, () => {
      // The failure this catches is silent and nasty: a column the schema
      // says is required but the migration lets default to NULL.
      const live = new Map(columnsOf(name).map((c) => [c.name, c]));
      const disagreements = getTableConfig(table)
        .columns.filter((column) => {
          const row = live.get(column.name);
          if (row === undefined) return false;
          // SQLite reports a single-column INTEGER PRIMARY KEY as notnull=0
          // while treating it as a rowid alias; primary keys are never
          // nullable in practice, so exclude them.
          if (row.pk > 0) return false;
          return column.notNull !== (row.notnull === 1);
        })
        .map((column) => column.name);
      expect(disagreements, `${name}: NOT NULL disagreement`).toEqual([]);
    });

    it(`${name} carries every CHECK constraint drizzle declares`, () => {
      // A dropped CHECK is invisible to every other assertion here — the
      // columns still line up, and the guard is simply gone.
      const ddl = ddlOf(name);
      const missing = getTableConfig(table)
        .checks.map((c) => c.name)
        .filter((constraint) => !ddl.includes(constraint));
      expect(missing, `${name}: CHECK declared in drizzle but absent from the migration`).toEqual(
        []
      );
    });
  }
});

describe('the migration creates nothing the schema barrel forgot to export', () => {
  it('has no unexpected tables', () => {
    const declared = new Set(ALL_TABLES.map((t) => getTableConfig(t).name));
    const live = (
      opened.raw
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`
        )
        .all() as { name: string }[]
    ).map((r) => r.name);

    expect(live.filter((name) => !declared.has(name))).toEqual([]);
  });
});

describe('foreign keys declared in drizzle are enforced by the migration', () => {
  const EXPECTED_FKS: Readonly<Record<string, readonly string[]>> = {
    // Both of them: the device it belongs to, and its own successor.
    refresh_tokens: ['devices', 'refresh_tokens'],
    // A pairing code is deliberately unlinked from the device it produced —
    // see the barrel's file header.
    pairing_codes: [],
    devices: [],
  };

  for (const [table, expected] of Object.entries(EXPECTED_FKS)) {
    it(`${table} references ${expected.length === 0 ? 'nothing' : expected.join(', ')}`, () => {
      const rows = opened.raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
        table: string;
      }[];
      expect(rows.map((r) => r.table).toSorted()).toEqual([...expected].toSorted());
    });
  }
});

describe('cascade behaviour is what the schema claims', () => {
  const EXPECTED_ON_DELETE: readonly (readonly [string, string, string])[] = [
    ['refresh_tokens', 'devices', 'CASCADE'],
    // NO ACTION, so pruning a successor out from under its predecessor is
    // refused rather than silently severing the rotation chain.
    ['refresh_tokens', 'refresh_tokens', 'NO ACTION'],
  ];

  for (const [table, parent, onDelete] of EXPECTED_ON_DELETE) {
    it(`${table} → ${parent} is ON DELETE ${onDelete}`, () => {
      const rows = opened.raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
        table: string;
        on_delete: string;
      }[];
      const fk = rows.find((r) => r.table === parent);
      expect(fk?.on_delete).toBe(onDelete);
    });
  }
});

describe('the lookups on the authenticated path are index-driven', () => {
  /**
   * Asserted through the planner rather than by checking an index exists,
   * because the two are not the same claim: an index whose columns don't
   * match the predicate is present and useless. Every authenticated request
   * runs one of these, so a full scan here is a cost paid per request
   * forever.
   */
  function planFor(sql: string): string {
    const rows = opened.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[];
    return rows.map((r) => r.detail).join(' | ');
  }

  it('devices by id uses the primary key index', () => {
    // No explicit index on `devices.id`: SQLite backs a non-INTEGER primary
    // key with an implicit unique index, which is what this proves.
    expect(planFor(`SELECT * FROM devices WHERE id = 'x'`)).toMatch(/USING INDEX|SEARCH/);
  });

  it('pairing codes by hash use an index', () => {
    expect(planFor(`SELECT * FROM pairing_codes WHERE code_hash = 'x'`)).toMatch(
      /USING INDEX|SEARCH/
    );
  });

  it('refresh tokens by hash use an index', () => {
    expect(planFor(`SELECT * FROM refresh_tokens WHERE token_hash = 'x'`)).toMatch(
      /USING INDEX|SEARCH/
    );
  });

  it('killing a family does not scan the table', () => {
    expect(planFor(`SELECT * FROM refresh_tokens WHERE family_id = 'x'`)).toContain(
      'idx_refresh_tokens_family'
    );
  });

  it('killing a device’s tokens does not scan the table', () => {
    expect(planFor(`SELECT * FROM refresh_tokens WHERE device_id = 'x'`)).toContain(
      'idx_refresh_tokens_device'
    );
  });
});
