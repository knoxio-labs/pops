/**
 * The drizzle table definitions and the hand-written migration are two
 * independent descriptions of the same database, and nothing forces them to
 * agree — this pillar has no `drizzle-kit generate` step, so a column added
 * to `src/db/schema/*.ts` without a matching migration edit would typecheck,
 * pass every service test that doesn't touch it, and fail only in
 * production on the first INSERT.
 *
 * This test closes that gap by introspecting the migrated database and
 * diffing it against the drizzle definitions, in both directions — for
 * columns, NOT NULL, foreign keys with their ON DELETE behaviour, and
 * indexes (including the indexes SQLite creates for a `unique()`
 * constraint or a column-level `.unique()`). Every expectation is read out
 * of `getTableConfig()`; nothing here is a hand-maintained literal, so a
 * schema change with no matching migration edit fails without anyone
 * having to remember to update this file too.
 *
 * Column *types* are deliberately not compared. SQLite's type affinity
 * means the migration's declared column type and drizzle's declared column
 * type can differ in spelling while affinity-matching (`integer` vs `int`,
 * or a `text` column drizzle types as an enum), so a literal string compare
 * would flag drift that changes nothing about how the column behaves.
 */
import { getTableConfig, uniqueKeyName } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseDocuments,
  purchaseItemAllocations,
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
  purchases,
  purchaseTags,
  purchaseShipments,
  purchaseMatchRules,
  purchaseSources,
} from '../schema.js';
import { openTempDb } from './helpers.js';

import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

const ALL_TABLES: readonly SQLiteTable[] = [
  purchaseSources,
  purchases,
  purchaseTags,
  purchaseShipments,
  purchaseItems,
  purchaseItemUnits,
  purchaseItemTags,
  purchaseItemNotes,
  purchaseMatchRules,
  purchaseCharges,
  purchaseChargeLinks,
  purchaseItemAllocations,
  purchaseDocuments,
];

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function columnsOf(table: string): ColumnInfo[] {
  return opened.raw.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
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
          // SQLite reports a single-column INTEGER PRIMARY KEY as
          // notnull=0 while treating it as a rowid alias; primary keys are
          // never nullable in practice, so exclude them.
          if (row.pk > 0) return false;
          return column.notNull !== (row.notnull === 1);
        })
        .map((column) => column.name);
      expect(disagreements, `${name}: NOT NULL disagreement`).toEqual([]);
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

interface LiveForeignKey {
  readonly table: string;
  readonly onDelete: string;
}

function liveForeignKeysOf(table: string): LiveForeignKey[] {
  return (
    opened.raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
      table: string;
      on_delete: string;
    }[]
  ).map((row) => ({ table: row.table, onDelete: row.on_delete }));
}

/**
 * What drizzle declares for one table's foreign keys, in the shape SQLite's
 * `PRAGMA foreign_key_list` reports them in — so the two can be compared
 * directly rather than through a hand-kept intermediate list.
 */
function declaredForeignKeysOf(table: SQLiteTable): LiveForeignKey[] {
  return getTableConfig(table).foreignKeys.map((fk) => ({
    table: getTableConfig(fk.reference().foreignTable).name,
    // SQLite's own default when a migration states no ON DELETE clause.
    onDelete: (fk.onDelete ?? 'no action').toUpperCase(),
  }));
}

const byTable = (a: LiveForeignKey, b: LiveForeignKey) => a.table.localeCompare(b.table);

describe('foreign keys and their ON DELETE behaviour match drizzle, in both directions', () => {
  for (const table of ALL_TABLES) {
    const { name } = getTableConfig(table);
    it(`${name} references exactly what drizzle declares`, () => {
      expect(liveForeignKeysOf(name).toSorted(byTable)).toEqual(
        declaredForeignKeysOf(table).toSorted(byTable)
      );
    });
  }
});

interface ExpectedIndex {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
}

/**
 * Every index SQLite will actually create for one table: the ones declared
 * through `index()`/`uniqueIndex()`, the ones declared through the
 * table-level `unique()` builder, and the ones a column-level `.unique()`
 * produces under drizzle's own default name — three different drizzle APIs
 * that all end up as a `CREATE INDEX` in the migration.
 */
function expectedIndexesOf(table: SQLiteTable): ExpectedIndex[] {
  const { indexes, uniqueConstraints, columns } = getTableConfig(table);

  const fromIndexBuilder = indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map((column) =>
      'name' in column && typeof column.name === 'string' ? column.name : '(expression)'
    ),
    unique: index.config.unique,
  }));

  const fromTableUnique = uniqueConstraints.map((constraint) => ({
    name:
      constraint.getName() ??
      uniqueKeyName(
        table,
        constraint.columns.map((c) => c.name)
      ),
    columns: constraint.columns.map((c) => c.name),
    unique: true,
  }));

  const fromColumnUnique = columns
    .filter((column) => column.isUnique)
    .map((column) => ({
      name: column.uniqueName ?? uniqueKeyName(table, [column.name]),
      columns: [column.name],
      unique: true,
    }));

  return [...fromIndexBuilder, ...fromTableUnique, ...fromColumnUnique];
}

interface LiveIndex {
  readonly name: string;
  readonly unique: boolean;
}

/**
 * Excludes SQLite's own `sqlite_autoindex_*` rows: those back an inline
 * `PRIMARY KEY`/`UNIQUE` column constraint declared directly in
 * `CREATE TABLE`, which this migration never uses — every unique
 * constraint here is a standalone `CREATE UNIQUE INDEX`, so an autoindex
 * appearing at all would itself be schema drift this test should not paper
 * over by silently excluding it. It is excluded from the *expected* side
 * for the same reason drizzle never declares one: nothing in `schema.ts`
 * asks for an inline constraint.
 */
function liveIndexesOf(table: string): LiveIndex[] {
  return (
    opened.raw.prepare(`PRAGMA index_list(${table})`).all() as {
      name: string;
      unique: number;
    }[]
  )
    .filter((row) => !row.name.startsWith('sqlite_autoindex_'))
    .map((row) => ({ name: row.name, unique: row.unique === 1 }));
}

function liveIndexColumns(indexName: string): string[] {
  return (
    opened.raw.prepare(`PRAGMA index_info(${indexName})`).all() as {
      seqno: number;
      name: string | null;
    }[]
  )
    .toSorted((a, b) => a.seqno - b.seqno)
    .map((row) => row.name ?? '(expression)');
}

describe('indexes and unique constraints match drizzle exactly, in both directions', () => {
  for (const table of ALL_TABLES) {
    const { name } = getTableConfig(table);
    const declared = expectedIndexesOf(table);

    it(`${name} has exactly the indexes and unique constraints drizzle declares`, () => {
      // Bidirectional by construction: an index in `schema.ts` with no
      // migration edit fails the same assertion as a migration index
      // nothing in `schema.ts` declares.
      expect(
        liveIndexesOf(name)
          .map((i) => i.name)
          .toSorted()
      ).toEqual(declared.map((i) => i.name).toSorted());
    });

    for (const index of declared) {
      // Name agreement is not enough: the first index change this pillar
      // made kept its name and changed what it covers, and a name-only
      // check passes just as happily for a composite silently reverted to
      // one column — which costs nothing visible until the query it exists
      // for starts scanning.
      it(`${index.name} covers what drizzle says and matches its uniqueness`, () => {
        expect(liveIndexColumns(index.name)).toEqual(index.columns);
        expect(liveIndexesOf(name).find((i) => i.name === index.name)?.unique).toBe(index.unique);
      });
    }
  }
});
