import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { purchaseItems } from '../schema.js';
import { openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { OpenedPurchasesDb } from '../index.js';

const BEFORE_MEASURE_FLAG = '0020_amazon_descriptor_alternatives';

function seedPriorRows(raw: Database.Database): void {
  raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES ('woolworths', 'Woolworths')`).run();
  raw
    .prepare(
      `INSERT INTO purchases
         (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum)
       VALUES ('p1', 'woolworths', 'receipt-1', 'upload', '2026-02-02T01:41:21Z', 'AUD', 1000, 'c1')`
    )
    .run();

  const insertItem = raw.prepare(
    `INSERT INTO purchase_items (id, purchase_id, position, name, unit_price_cents, line_total_cents)
     VALUES (?, 'p1', ?, ?, 500, 500)`
  );
  insertItem.run('weighed', 0, 'Loose Pear');
  insertItem.run('per-each', 1, 'Apple');

  const insertNote = raw.prepare(
    `INSERT INTO purchase_item_notes (item_id, position, note) VALUES (?, 0, ?)`
  );
  insertNote.run('weighed', '0.202 kg NET @ $2.90/kg');
  insertNote.run('per-each', '1 ea @ $5.00');
}

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openSeededAtMigration({
    through: BEFORE_MEASURE_FLAG,
    prefix: 'purchases-migration-0021-measure-flag-',
    seed: seedPriorRows,
  }));
});

afterEach(() => {
  cleanup();
});

describe('adding priced_by_measure to existing purchase items', () => {
  it('leaves prior rows unflagged even when their notes describe a rate', () => {
    const rows = opened.db
      .select({ id: purchaseItems.id, pricedByMeasure: purchaseItems.pricedByMeasure })
      .from(purchaseItems)
      .orderBy(purchaseItems.position)
      .all();

    expect(rows).toEqual([
      { id: 'weighed', pricedByMeasure: false },
      { id: 'per-each', pricedByMeasure: false },
    ]);
    expect(opened.db.select().from(purchaseItems).all()).toHaveLength(2);
  });

  it('preserves the notes that preceded the structured flag', () => {
    const weighed = opened.db
      .select({ pricedByMeasure: purchaseItems.pricedByMeasure })
      .from(purchaseItems)
      .where(eq(purchaseItems.id, 'weighed'))
      .get();
    const notes = opened.raw
      .prepare('SELECT note FROM purchase_item_notes WHERE item_id = ? ORDER BY position')
      .all('weighed') as { note: string }[];

    expect(weighed?.pricedByMeasure).toBe(false);
    expect(notes.map((row) => row.note)).toEqual(['0.202 kg NET @ $2.90/kg']);
  });
});
