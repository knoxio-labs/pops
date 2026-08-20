/**
 * `ordered_at` as an instant rather than as text.
 *
 * The column is TEXT and every comparison on it is lexicographic, so string
 * order has to equal chronological order for any date window in the pillar
 * to mean what it says. Nothing in the schema enforced that: an offset
 * timestamp sorts hours from where it belongs, and a second-precision one
 * sorts on the wrong side of a sub-second one. Both were silent — a window
 * returns a plausible list either way, and the figure it feeds is simply
 * wrong.
 *
 * Every case here is written the way it bites in Sydney, which is UTC+10/+11:
 * an order placed on the evening of the last day of a month, whose UTC
 * instant is the same day and whose text sorts into the next one.
 *
 * No test in this pillar used anything but `…Z` before, which is exactly why
 * none of this had ever gone red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  canonicalInstant,
  createPurchase,
  findPurchaseAtInstantForAmount,
  listPurchases,
  listSolvableCharges,
} from '../index.js';
import { openTempDb, seedWoolworthsSource } from './helpers.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedWoolworthsSource(opened);
});

afterEach(() => {
  cleanup();
});

function order(checksum: string, orderedAt: string): CreatePurchaseInput {
  return {
    source: 'woolworths',
    ingestMethod: 'upload',
    orderedAt,
    currency: 'AUD',
    totalCents: 4500,
    checksum,
    charges: [{ sourceChargeRef: `${checksum}-c`, amountCents: 4500, role: 'capture' }],
  };
}

function storedOrderedAt(id: string): string {
  const row = opened.raw.prepare(`SELECT ordered_at AS at FROM purchases WHERE id = ?`).get(id) as {
    at: string;
  };
  return row.at;
}

describe('canonicalInstant', () => {
  it('resolves an offset to the instant it names', () => {
    expect(canonicalInstant('2026-01-31T21:00:00+10:00')).toBe('2026-01-31T11:00:00.000Z');
  });

  it('pads a second-precision timestamp to the width every stored value has', () => {
    // Unpadded, `…21Z` sorts AFTER `…21.500Z` because `Z` follows `.`, which
    // reverses two instants half a second apart.
    expect(canonicalInstant('2026-02-02T01:41:21Z')).toBe('2026-02-02T01:41:21.000Z');
  });

  it('leaves a value already in the stored form byte for byte', () => {
    expect(canonicalInstant('2026-02-02T01:41:21.500Z')).toBe('2026-02-02T01:41:21.500Z');
  });

  it('truncates below the millisecond the pillar keeps rather than rounding', () => {
    expect(canonicalInstant('2026-02-02T01:41:21.987654321Z')).toBe('2026-02-02T01:41:21.987Z');
  });

  it('reports a timestamp whose fields name no instant', () => {
    expect(canonicalInstant('2026-13-45T00:00:00Z')).toBeNull();
    expect(canonicalInstant('2026-01-01T00:00:00+99:00')).toBeNull();
  });
});

describe('writing an order', () => {
  it('stores an offset timestamp as the instant it names', () => {
    const id = createPurchase(opened.db, order('offset', '2026-01-31T21:00:00+10:00'));

    expect(storedOrderedAt(id)).toBe('2026-01-31T11:00:00.000Z');
  });

  it('stores a second-precision timestamp at the width the column compares on', () => {
    const id = createPurchase(opened.db, order('coarse', '2026-02-02T01:41:21Z'));

    expect(storedOrderedAt(id)).toBe('2026-02-02T01:41:21.000Z');
  });

  it('stores a UTC millisecond timestamp exactly as it arrived', () => {
    // The form every shipped adapter already emits. It must round-trip
    // untouched, or this change rewrites history it had no reason to.
    const id = createPurchase(opened.db, order('utc', '2026-02-02T01:41:21.500Z'));

    expect(storedOrderedAt(id)).toBe('2026-02-02T01:41:21.500Z');
  });

  it('refuses a timestamp naming no instant rather than storing one that sorts somewhere', () => {
    expect(() => createPurchase(opened.db, order('nonsense', '2026-13-45T00:00:00Z'))).toThrow(
      /names no instant/u
    );
  });

  it('recognises a re-upload that states the same instant in another form', () => {
    // The shop-moment dedup matches on the stored timestamp. Two spellings
    // of one instant must be one shop, or the second upload of a photographed
    // receipt becomes a second purchase.
    createPurchase(opened.db, order('first', '2026-01-31T21:00:00+10:00'));

    const found = findPurchaseAtInstantForAmount(opened.db, {
      source: 'woolworths',
      orderedAt: '2026-01-31T11:00:00Z',
      totalCents: 4500,
      currency: 'AUD',
    });

    expect(found?.checksum).toBe('first');
  });
});

describe('a January window over an order placed on a Sydney evening', () => {
  const JANUARY_END = '2026-01-31T23:59:59.999Z';

  beforeEach(() => {
    // 9pm on 31 January in Sydney is 11am on 31 January UTC — inside
    // January. As text `2026-01-31T21:00:00+10:00` sorts past the end bound
    // and the order falls out of its own month.
    createPurchase(opened.db, order('sydney-evening', '2026-01-31T21:00:00+10:00'));
    // 9am on 1 February in Sydney is 10pm on 31 January UTC — inside
    // January too, and as text it sorts into February.
    createPurchase(opened.db, order('sydney-morning', '2026-02-01T09:00:00+11:00'));
  });

  it('counts both orders, which happened in January wherever they sort', () => {
    const found = listPurchases(opened.db, { from: '2026-01-01T00:00:00Z', to: JANUARY_END });

    expect(found.map((row) => row.checksum).sort()).toEqual(['sydney-evening', 'sydney-morning']);
  });

  it('counts neither of them in February', () => {
    const found = listPurchases(opened.db, {
      from: '2026-02-01T00:00:00Z',
      to: '2026-02-28T23:59:59.999Z',
    });

    expect(found).toEqual([]);
  });

  it('takes a bound written with an offset to the same window as its UTC twin', () => {
    // `2026-02-01T00:00:00+11:00` IS `2026-01-31T13:00:00Z`, which sits
    // between the two orders. As text it sorts into February, past both, so
    // an uncanonicalised bound answers with neither.
    const local = listPurchases(opened.db, { from: '2026-02-01T00:00:00+11:00' });
    const utc = listPurchases(opened.db, { from: '2026-01-31T13:00:00Z' });

    expect(local.map((row) => row.checksum)).toEqual(utc.map((row) => row.checksum));
    expect(local.map((row) => row.checksum)).toEqual(['sydney-morning']);
  });

  it('gives the reconcile sweep the same window the order index has', () => {
    // The sweep builds its own bounds rather than going through the scope
    // filter, and a charge the solver cannot see is indistinguishable, from
    // the solver's side, from a charge that does not exist.
    const bounds = { from: '2026-02-01T00:00:00+11:00', to: JANUARY_END };

    expect(listSolvableCharges(opened.db, bounds).map((charge) => charge.orderedAt)).toEqual(
      listPurchases(opened.db, bounds).map((row) => row.orderedAt)
    );
    expect(listSolvableCharges(opened.db, bounds)).toHaveLength(1);
  });
});

describe('a bound at second precision against a sub-second order', () => {
  beforeEach(() => {
    createPurchase(opened.db, order('half-past', '2026-02-02T01:41:21.500Z'));
  });

  it('excludes an instant later than the bound, which text order put earlier', () => {
    // `.500Z` sorts BEFORE the unpadded `Z` bound, so an unnormalised
    // comparison lets an order half a second past the window into it.
    expect(
      listPurchases(opened.db, { from: '2026-02-01T00:00:00Z', to: '2026-02-02T01:41:21Z' })
    ).toEqual([]);
  });

  it('includes it once the bound reaches it', () => {
    expect(
      listPurchases(opened.db, { from: '2026-02-01T00:00:00Z', to: '2026-02-02T01:41:22Z' })
    ).toHaveLength(1);
  });
});
