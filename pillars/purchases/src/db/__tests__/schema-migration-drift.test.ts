/**
 * The drizzle table definitions and the hand-written migration are two
 * independent descriptions of the same database, and nothing forces them to
 * agree — this pillar has no `drizzle-kit generate` step, so a column added
 * to `src/db/schema/*.ts` without a matching migration edit would typecheck,
 * pass every service test that doesn't touch it, and fail only in
 * production on the first INSERT.
 *
 * This test closes that gap by introspecting the migrated database and
 * diffing it against the drizzle definitions, in both directions.
 */
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseDocuments,
  purchaseItemAllocations,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
  purchases,
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
  purchaseShipments,
  purchaseItems,
  purchaseItemUnits,
  purchaseItemTags,
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

describe('foreign keys declared in drizzle are enforced by the migration', () => {
  const EXPECTED_FKS: Readonly<Record<string, readonly string[]>> = {
    purchases: ['purchase_sources'],
    purchase_shipments: ['purchases'],
    purchase_items: ['purchases', 'purchase_shipments'],
    purchase_item_units: ['purchase_items'],
    purchase_item_tags: ['purchase_items'],
    purchase_charges: ['purchases', 'purchase_shipments'],
    purchase_charge_links: ['purchase_charges', 'purchase_match_rules'],
    purchase_item_allocations: ['purchase_charges', 'purchase_items'],
    purchase_documents: ['purchases', 'purchase_shipments'],
  };

  for (const [table, expected] of Object.entries(EXPECTED_FKS)) {
    it(`${table} references ${expected.join(', ')}`, () => {
      const rows = opened.raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
        table: string;
      }[];
      expect(rows.map((r) => r.table).toSorted()).toEqual([...expected].toSorted());
    });
  }
});

describe('cascade behaviour is what the schema claims', () => {
  const EXPECTED_ON_DELETE: readonly (readonly [string, string, string])[] = [
    ['purchase_shipments', 'purchases', 'CASCADE'],
    ['purchase_items', 'purchases', 'CASCADE'],
    // Deliberately SET NULL: removing a delivery must orphan its lines,
    // not destroy them. The money was still spent.
    ['purchase_items', 'purchase_shipments', 'SET NULL'],
    ['purchase_item_units', 'purchase_items', 'CASCADE'],
    ['purchase_item_tags', 'purchase_items', 'CASCADE'],
    ['purchase_charges', 'purchases', 'CASCADE'],
    ['purchase_charges', 'purchase_shipments', 'SET NULL'],
    ['purchase_charge_links', 'purchase_charges', 'CASCADE'],
    ['purchase_item_allocations', 'purchase_charges', 'CASCADE'],
    ['purchase_item_allocations', 'purchase_items', 'CASCADE'],
    // A rule must survive being referenced — deleting one must not silently
    // delete the links it produced.
    ['purchase_charge_links', 'purchase_match_rules', 'NO ACTION'],
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

describe('indexes the hot paths depend on', () => {
  const EXPECTED_INDEXES: readonly string[] = [
    'idx_purchases_source_ordered_at',
    'idx_purchases_status',
    'idx_purchase_items_purchase',
    'idx_purchase_items_shipment',
    'idx_purchase_item_tags_tag',
    'idx_purchase_charges_purchase',
    'idx_purchase_charge_links_transaction',
    'idx_purchase_charge_links_confirmed_at',
    'idx_purchase_item_allocations_item',
    'uq_purchases_source_order',
    'uq_purchase_charge_links',
    'uq_purchase_item_allocations',
    'uq_purchase_documents',
  ];

  it('all exist', () => {
    const live = new Set(
      (
        opened.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as {
          name: string;
        }[]
      ).map((r) => r.name)
    );
    expect(EXPECTED_INDEXES.filter((name) => !live.has(name))).toEqual([]);
  });
});
