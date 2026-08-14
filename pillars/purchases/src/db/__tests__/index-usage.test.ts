/**
 * The indexes, as query plans rather than as declarations.
 *
 * `schema-migration-drift.test.ts` proves each index exists and covers the
 * columns drizzle declares. That is necessary and not sufficient: an index
 * SQLite declines to use answers no question faster than no index at all,
 * and a partial index is the easiest kind to declare and then miss —
 * narrowing its `WHERE` or widening the query's is enough.
 *
 * The promotional-price plan is the load-bearing one. Moving that fact off
 * the indexed tag table and onto a column is what the alternative design
 * was rejected for: it would have turned "was this on special", across
 * every order, into a table scan. This asserts the answer that rejection
 * assumed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

function planFor(sql: string): string {
  return (opened.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[])
    .map((row) => row.detail)
    .join(' | ');
}

describe('the cross-order questions each index exists to answer', () => {
  it('searches rather than scans for "was this on special"', () => {
    const plan = planFor(`SELECT id FROM purchase_items WHERE promotional_price = 1`);
    expect(plan).toContain('idx_purchase_items_promotional_price');
    expect(plan).not.toContain('SCAN purchase_items');
  });

  it('searches rather than scans for the proposal pass work set', () => {
    // `kind IS NULL AND kind_confirmed_at IS NULL` is what selects a run's
    // candidates, so a scan here is paid on every sweep over a year of
    // history.
    const plan = planFor(
      `SELECT id FROM purchase_items WHERE kind IS NULL AND kind_confirmed_at IS NULL`
    );
    expect(plan).toContain('idx_purchase_items_kind');
    expect(plan).not.toContain('SCAN purchase_items');
  });

  it('searches rather than scans for the orders behind one transaction', () => {
    // The reverse lookup a finance transaction view arrives with. The only
    // other index on this table leading with `transaction_uri` is none:
    // `uq_purchase_charge_links` leads with `charge_id` and cannot serve
    // this, so dropping the dedicated one turns every such lookup into a
    // scan of every link ever written.
    const plan = planFor(
      `SELECT charge_id FROM purchase_charge_links WHERE transaction_uri = 'pops://finance/transaction/t1'`
    );
    expect(plan).toContain('idx_purchase_charge_links_transaction');
    expect(plan).not.toContain('SCAN purchase_charge_links');
  });

  it('searches rather than scans for every line carrying a tag', () => {
    const plan = planFor(`SELECT item_id FROM purchase_item_tags WHERE tag = 'fruit'`);
    expect(plan).toContain('idx_purchase_item_tags_tag');
    expect(plan).not.toContain('SCAN purchase_item_tags');
  });
});
