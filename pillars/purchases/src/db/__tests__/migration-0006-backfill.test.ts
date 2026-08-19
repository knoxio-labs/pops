/**
 * The backfill in migration 0006, run against rows shaped the way the
 * shipped adapters actually wrote them before a scheme existed.
 *
 * Every other suite opens a database that was empty when the migration ran,
 * so a backfill that stamped nothing — or stamped the wrong namespace on
 * everything — would pass all of them and only be discovered against the
 * live file, where the ASINs it mislabelled are indistinguishable from
 * article numbers afterwards.
 *
 * The database is brought up to 0005 from a journal truncated at that point,
 * seeded with raw SQL, closed, then reopened against the real migrations
 * folder — drizzle's migrator runs only the entries newer than the last one
 * recorded.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openPurchasesDb } from '../open-purchases-db.js';

import type { OpenedPurchasesDb } from '../index.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry before 0006 adds `sku_scheme`. */
const BEFORE_SKU_SCHEME = '0005_reconcile_decisions_persist';

interface SeededItem {
  readonly id: string;
  readonly source: string;
  readonly sku: string | null;
}

/**
 * The world as it stood at 0005: Amazon lines carrying ASINs, grocery and
 * drop-zone lines carrying nothing, and one line a caller posted an
 * identifier for through `POST /purchases` without ever saying what kind of
 * identifier it was — the only way this column could hold a non-ASIN.
 */
const SEED: readonly SeededItem[] = [
  { id: 'a-tamper', source: 'amazon', sku: 'B0DSVZQ8P5' },
  { id: 'a-funnel', source: 'amazon', sku: 'B0FCSJTKJ8' },
  { id: 'a-noasin', source: 'amazon', sku: null },
  { id: 'w-eggs', source: 'woolworths', sku: null },
  { id: 'r-timber', source: 'receipt', sku: null },
  { id: 'b-article', source: 'bunnings', sku: '4471' },
];

let dir: string;
let dbPath: string;
let opened: OpenedPurchasesDb;

function seedThrough0005(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    targetFolder: join(dir, 'migrations'),
    through: BEFORE_SKU_SCHEME,
  });
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  for (const source of new Set(SEED.map((item) => item.source))) {
    raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES (?, ?)`).run(source, source);
    raw
      .prepare(
        `INSERT INTO purchases (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum)
         VALUES (?, ?, ?, 'export', '2026-02-02T01:41:21Z', 'AUD', 100, ?)`
      )
      .run(`p-${source}`, source, `order-${source}`, `checksum-${source}`);
  }

  for (const [position, item] of SEED.entries()) {
    raw
      .prepare(
        `INSERT INTO purchase_items (id, purchase_id, position, name, sku, unit_price_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, 100, 100)`
      )
      .run(item.id, `p-${item.source}`, position, item.id, item.sku);
  }
  raw.close();
}

interface StoredIdentity {
  sku: string | null;
  scheme: string | null;
}

function identityOf(itemId: string): StoredIdentity {
  return opened.raw
    .prepare(`SELECT sku, sku_scheme AS scheme FROM purchase_items WHERE id = ?`)
    .get(itemId) as StoredIdentity;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'purchases-migration-0006-'));
  dbPath = join(dir, 'purchases.db');
  seedThrough0005();
  opened = openPurchasesDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying 0006 to a database that already holds bare identifiers', () => {
  it("names Amazon's identifiers as ASINs", () => {
    expect(identityOf('a-tamper')).toEqual({ sku: 'B0DSVZQ8P5', scheme: 'asin' });
    expect(identityOf('a-funnel')).toEqual({ sku: 'B0FCSJTKJ8', scheme: 'asin' });
  });

  it('claims no more than merchant-local scope for an identifier nobody qualified', () => {
    // A caller that never said which namespace it meant has made the
    // weakest claim there is, and the backfill must not upgrade it into a
    // cross-source one on its behalf.
    expect(identityOf('b-article')).toEqual({ sku: '4471', scheme: 'merchant' });
  });

  it('leaves a line that states no identifier stating none', () => {
    // Not "unknown scheme": these sources name no product at all, and a
    // scheme here would be an identity invented by a migration.
    for (const id of ['a-noasin', 'w-eggs', 'r-timber']) {
      expect(identityOf(id), id).toEqual({ sku: null, scheme: null });
    }
  });

  it('leaves no row holding one half of the pair', () => {
    const rows = opened.raw
      .prepare(`SELECT sku, sku_scheme AS scheme FROM purchase_items`)
      .all() as StoredIdentity[];
    expect(rows).toHaveLength(SEED.length);
    for (const row of rows) {
      expect(row.sku === null).toBe(row.scheme === null);
    }
  });

  it('keeps the index that makes a namespaced lookup cheap', () => {
    const columns = opened.raw.prepare(`PRAGMA index_info('idx_purchase_items_sku')`).all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).toEqual(['sku_scheme', 'sku']);
  });
});
