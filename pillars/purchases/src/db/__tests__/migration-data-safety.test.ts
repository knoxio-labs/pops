/**
 * What the migration chain does to purchases that were already stored.
 *
 * The companion to `migration-0003-backfill.test.ts`, which pins what that one
 * backfill *changes*. This one pins what nothing may change: a row that was
 * written before a migration existed keeps its values verbatim, gains the
 * declared default for a column added after it, and stays attached to its
 * parent.
 *
 * The database is brought up to `0001_purchase_tags` from a truncated journal
 * — the last point before `0002` adds a NOT NULL column with a default — then
 * seeded and reopened with the real opener, which applies the rest.
 */
import { readdirSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal } from '@pops/pillar-sdk/db';

import { MIGRATIONS_DIR, openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { OpenedPurchasesDb } from '../index.js';

/** The last entry before `0002_purchase_surcharge` adds `surcharge_cents`. */
const BEFORE_ADDED_COLUMN = '0001_purchase_tags';

const ORDERED_AT = '2026-02-02T01:41:21Z';

interface SeededItem {
  readonly id: string;
  readonly name: string;
  readonly lineTotalCents: number;
}

const ITEMS: readonly SeededItem[] = [
  { id: 'i-milk', name: 'Milk 2L', lineTotalCents: 419 },
  { id: 'i-bread', name: 'Sourdough', lineTotalCents: 750 },
];

/** The evidence pointer, carrying the characters a rebuild is most likely to mangle. */
const RAW_REF = "woolworths-export-2026-02.csv#row=41 'left at door'";

let opened: OpenedPurchasesDb;
let dir: string;
let cleanup: () => void;

function seedThroughFirstMigration(raw: Database.Database): void {
  raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES ('woolworths', 'Woolworths')`).run();
  raw
    .prepare(
      `INSERT INTO purchases
         (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum, raw_ref)
       VALUES ('p-1', 'woolworths', 'order-1', 'export', ?, 'AUD', 1169, 'checksum-1', ?)`
    )
    .run(ORDERED_AT, RAW_REF);

  for (const [position, item] of ITEMS.entries()) {
    raw
      .prepare(
        `INSERT INTO purchase_items
           (id, purchase_id, position, name, unit_price_cents, line_total_cents)
         VALUES (?, 'p-1', ?, ?, ?, ?)`
      )
      .run(item.id, position, item.name, item.lineTotalCents, item.lineTotalCents);
  }

  raw.prepare(`INSERT INTO purchase_tags (purchase_id, tag) VALUES ('p-1', 'weekly-shop')`).run();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

beforeEach(() => {
  ({ opened, dir, cleanup } = openSeededAtMigration({
    through: BEFORE_ADDED_COLUMN,
    prefix: 'purchases-migration-safety-',
    seed: seedThroughFirstMigration,
  }));
});

afterEach(() => {
  cleanup();
});

describe('applying the rest of the journal to a populated purchases database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows(`SELECT created_at FROM __drizzle_migrations`);
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows', () => {
    expect(rows(`SELECT id FROM purchases`)).toHaveLength(1);
    expect(rows(`SELECT id FROM purchase_items`)).toHaveLength(ITEMS.length);
  });

  it('gives a row written before the column existed its declared default', () => {
    // 0002 adds `surcharge_cents integer DEFAULT 0 NOT NULL`. A migration that
    // added it nullable, or backfilled it from something, would show up here.
    const stored = rows<{ surcharge_cents: number }>(`SELECT surcharge_cents FROM purchases`);
    expect(stored).toEqual([{ surcharge_cents: 0 }]);
  });

  it('keeps every column the row was written with', () => {
    const stored = rows<{
      source_order_id: string;
      ordered_at: string;
      currency: string;
      total_cents: number;
      checksum: string;
    }>(`SELECT source_order_id, ordered_at, currency, total_cents, checksum FROM purchases`);
    expect(stored).toEqual([
      {
        source_order_id: 'order-1',
        ordered_at: ORDERED_AT,
        currency: 'AUD',
        total_cents: 1169,
        checksum: 'checksum-1',
      },
    ]);
  });

  it('leaves the evidence pointer byte-identical, quotes and all', () => {
    const stored = rows<{ raw_ref: string }>(`SELECT raw_ref FROM purchases`);
    expect(stored).toEqual([{ raw_ref: RAW_REF }]);
  });

  it('keeps every line attached to its purchase', () => {
    const stored = rows<{ id: string; name: string; line_total_cents: number }>(
      `SELECT i.id, i.name, i.line_total_cents FROM purchase_items i
       JOIN purchases p ON p.id = i.purchase_id ORDER BY i.position`
    );
    expect(stored).toEqual(
      ITEMS.map((item) => ({
        id: item.id,
        name: item.name,
        line_total_cents: item.lineTotalCents,
      }))
    );
  });

  it('leaves no broken foreign key and no corrupted page', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });

  it('removes the pre-migration snapshot it took on the way through', () => {
    // The reopen above had three entries pending against a file that already
    // held rows, so the snapshot path really ran here.
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });
});
