/**
 * Migration 0019 rebuilds `purchases` to widen its status CHECK. Every other
 * order table cascades from it, directly or through items and charges, so a
 * rebuild that runs with foreign keys enforced deletes all of them when the
 * old table is dropped. This stages one row in each and checks none is lost.
 */
import { afterEach, expect, it } from 'vitest';

import { openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { SeededAtMigration } from './migration-harness.js';

const CASCADING_TABLES = [
  'purchase_shipments',
  'purchase_items',
  'purchase_item_units',
  'purchase_item_tags',
  'purchase_item_notes',
  'purchase_charges',
  'purchase_charge_links',
  'purchase_item_allocations',
  'purchase_link_rejections',
  'purchase_documents',
  'purchase_tags',
  'purchase_capture',
  'purchase_edits',
] as const;

function seedEveryChildTable(raw: Database.Database): void {
  const statements = [
    `INSERT INTO purchase_sources (id, label) VALUES ('amazon', 'Amazon')`,
    `INSERT INTO purchases (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum)
       VALUES ('p1', 'amazon', 'o1', 'export', '2026-02-02T01:41:21Z', 'AUD', 5678, 'c1')`,
    `INSERT INTO purchase_shipments (id, purchase_id) VALUES ('s1', 'p1')`,
    `INSERT INTO purchase_items (id, purchase_id, shipment_id, name, unit_price_cents, line_total_cents)
       VALUES ('i1', 'p1', 's1', 'Tamper', 5678, 5678)`,
    `INSERT INTO purchase_item_units (id, item_id) VALUES ('u1', 'i1')`,
    `INSERT INTO purchase_item_tags (item_id, tag) VALUES ('i1', 'coffee')`,
    `INSERT INTO purchase_item_notes (item_id, position, note) VALUES ('i1', 0, 'gift')`,
    `INSERT INTO purchase_charges (id, purchase_id, amount_cents, currency, order_amount_cents)
       VALUES ('ch1', 'p1', 5678, 'AUD', 5678)`,
    `INSERT INTO purchase_charge_links (id, charge_id, transaction_uri, amount_cents, link_type)
       VALUES ('l1', 'ch1', 'pops://finance/transaction/t1', 5678, 'exact')`,
    `INSERT INTO purchase_item_allocations (id, charge_id, item_id, amount_cents)
       VALUES ('a1', 'ch1', 'i1', 5678)`,
    `INSERT INTO purchase_link_rejections (charge_id, transaction_uri, rejected_at)
       VALUES ('ch1', 'pops://finance/transaction/t2', '2026-02-03T00:00:00Z')`,
    `INSERT INTO purchase_documents (id, purchase_id, document_uri) VALUES ('d1', 'p1', 'pops://doc/1')`,
    `INSERT INTO purchase_tags (purchase_id, tag) VALUES ('p1', 'kitchen')`,
    `INSERT INTO purchase_capture (purchase_id) VALUES ('p1')`,
    `INSERT INTO purchase_edits (id, purchase_id, field, edited_at)
       VALUES ('e1', 'p1', 'total_cents', '2026-02-03T00:00:00Z')`,
  ];
  for (const statement of statements) raw.prepare(statement).run();
}

let seeded: SeededAtMigration | undefined;

afterEach(() => {
  seeded?.cleanup();
  seeded = undefined;
});

it.each(CASCADING_TABLES)('keeps the %s row through the purchases rebuild', (table) => {
  seeded = openSeededAtMigration({
    through: '0018_amazon_source_matching',
    prefix: 'purchases-0019-children-',
    seed: seedEveryChildTable,
  });

  const row = seeded.opened.raw.prepare(`SELECT count(*) AS n FROM "${table}"`).get();

  expect(row).toEqual({ n: 1 });
});

it('turns foreign keys back on once the migration has applied', () => {
  seeded = openSeededAtMigration({
    through: '0018_amazon_source_matching',
    prefix: 'purchases-0019-fk-',
    seed: seedEveryChildTable,
  });

  expect(seeded.opened.raw.pragma('foreign_keys', { simple: true })).toBe(1);
});
