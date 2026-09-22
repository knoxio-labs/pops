import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase } from '../index.js';
import { purchaseEdits, purchaseItems } from '../schema.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

describe('purchase_edits', () => {
  it('applies against the current schema and records a row', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());
    opened.db
      .insert(purchaseEdits)
      .values({
        purchaseId,
        field: 'merchant',
        itemId: null,
        original: 'Amazon',
        editedAt: '2026-09-20T00:00:00.000Z',
      })
      .run();

    const rows = opened.db
      .select()
      .from(purchaseEdits)
      .where(eq(purchaseEdits.purchaseId, purchaseId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.original).toBe('Amazon');
  });

  it('cascades when the purchase it describes is deleted', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());
    opened.db
      .insert(purchaseEdits)
      .values({
        purchaseId,
        field: 'total',
        itemId: null,
        original: '5678',
        editedAt: '2026-09-20T00:00:00.000Z',
      })
      .run();

    opened.raw.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);

    const rows = opened.db
      .select()
      .from(purchaseEdits)
      .where(eq(purchaseEdits.purchaseId, purchaseId))
      .all();
    expect(rows).toEqual([]);
  });

  it('refuses a second row for the same (purchase_id, field, item_id)', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        items: [{ ref: 'a', name: 'Widget', unitPriceCents: 500, lineTotalCents: 500 }],
      })
    );
    const [item] = opened.db.select().from(purchaseItems).all();
    const itemId = item?.id;
    expect(itemId).toBeDefined();

    opened.db
      .insert(purchaseEdits)
      .values({
        purchaseId,
        field: 'lineName',
        itemId,
        original: 'Widget',
        editedAt: '2026-09-20T00:00:00.000Z',
      })
      .run();

    expect(() =>
      opened.db
        .insert(purchaseEdits)
        .values({
          purchaseId,
          field: 'lineName',
          itemId,
          original: 'Widget (second edit)',
          editedAt: '2026-09-20T00:01:00.000Z',
        })
        .run()
    ).toThrow(/UNIQUE constraint failed/);
  });
});
