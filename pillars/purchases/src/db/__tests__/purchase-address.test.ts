/**
 * `merchantAddressId`/`merchantAddressName` on create (ADR-053) — the branch
 * a purchase was made at, mirroring how `merchantEntityId`/`merchantEntityName`
 * already persist.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase } from '../index.js';
import { purchases } from '../schema.js';
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

function row(id: string) {
  return opened.db.select().from(purchases).where(eq(purchases.id, id)).get();
}

describe('merchantAddressId / merchantAddressName on create', () => {
  it('persists both fields when supplied', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        merchantAddressId: 'addr-1',
        merchantAddressName: '12 Example St, Sydney',
      })
    );

    const stored = row(id);
    expect(stored?.merchantAddressId).toBe('addr-1');
    expect(stored?.merchantAddressName).toBe('12 Example St, Sydney');
  });

  it('leaves both null when omitted', () => {
    const id = createPurchase(opened.db, amazonOrder());

    const stored = row(id);
    expect(stored?.merchantAddressId).toBeNull();
    expect(stored?.merchantAddressName).toBeNull();
  });

  it('normalises a whitespace-only merchantAddressName to null', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        merchantAddressId: 'addr-1',
        merchantAddressName: '   ',
      })
    );

    const stored = row(id);
    expect(stored?.merchantAddressId).toBe('addr-1');
    expect(stored?.merchantAddressName).toBeNull();
  });
});
