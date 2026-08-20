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
  spelledOffsetMinutes,
  UnreadableOrderedAtBoundError,
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

  it("names no instant for a wall clock with no zone, rather than the host machine's", () => {
    // `new Date` resolves this against wherever the process runs, so the
    // stored instant would differ between a Sydney laptop and a UTC
    // container by the ten or eleven hours `src/ingest/local-time.ts` exists
    // to keep out. The contract does not admit it and neither does this.
    expect(canonicalInstant('2026-02-02T01:41:21')).toBeNull();
    expect(canonicalInstant('2026-02-02 01:41:21')).toBeNull();
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

  it('refuses a wall clock with no zone rather than storing where the server stands', () => {
    expect(() => createPurchase(opened.db, order('naive', '2026-02-02T01:41:21'))).toThrow(
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

/**
 * Canonicalising is what makes a text comparison on this column a
 * chronological one, and the offset is what it spends to get there. A
 * caller writing `2026-08-21T09:00:00+10:00` has stated both when the order
 * happened and where; only the first survives the rewrite, and the calendar
 * day a person would put on that order is not recoverable from what is
 * left. So the offset is read off the caller's spelling and kept beside the
 * instant, before the spelling is gone.
 */
describe('the offset a caller spelled, which canonicalising discards', () => {
  function storedOffset(id: string): number | null {
    const row = opened.raw
      .prepare(`SELECT ordered_at_offset_minutes AS offset FROM purchases WHERE id = ?`)
      .get(id) as { offset: number | null };
    return row.offset;
  }

  it('reads a positive offset off the spelling', () => {
    expect(spelledOffsetMinutes('2026-08-21T09:00:00+10:00')).toBe(600);
  });

  it('reads a negative one', () => {
    expect(spelledOffsetMinutes('2026-08-20T19:00:00-07:00')).toBe(-420);
  });

  it('reads a half-hour zone, which whole-hour arithmetic would round away', () => {
    expect(spelledOffsetMinutes('2026-08-21T09:00:00+05:30')).toBe(330);
  });

  it('answers null for a UTC spelling rather than claiming Greenwich', () => {
    // Zero is a place. A caller writing `Z` stated an instant and named no
    // place at all, and storing 0 would assert the UTC day IS the local one
    // — indistinguishable, later, from an order genuinely placed in London.
    expect(spelledOffsetMinutes('2026-08-20T23:00:00.000Z')).toBeNull();
  });

  it('answers null for an offset no zone has ever been on', () => {
    // ISO-8601 admits it; the column's CHECK does not. Reading it would
    // turn one odd timestamp into a constraint failure that loses the
    // entire ingest.
    expect(spelledOffsetMinutes('2026-08-21T09:00:00+18:00')).toBeNull();
  });

  it('keeps the offset of an order whose instant it just rewrote', () => {
    const id = createPurchase(opened.db, order('sydney', '2026-08-21T09:00:00+10:00'));

    expect(storedOrderedAt(id)).toBe('2026-08-20T23:00:00.000Z');
    expect(storedOffset(id)).toBe(600);
  });

  it('stores no offset for an order stated as an instant', () => {
    const id = createPurchase(opened.db, order('utc-only', '2026-08-20T23:00:00.000Z'));

    expect(storedOffset(id)).toBeNull();
  });

  it('prefers an offset the adapter resolved over the one the spelling implies', () => {
    // The receipt leg resolves a zone from photograph evidence and hands
    // the offset over explicitly. That answer knows about DST; a suffix
    // only repeats whatever the caller typed.
    const id = createPurchase(opened.db, {
      ...order('explicit', '2026-08-20T23:00:00.000Z'),
      orderedAtOffsetMinutes: 600,
    });

    expect(storedOffset(id)).toBe(600);
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

describe('a bound that names no instant', () => {
  beforeEach(() => {
    createPurchase(opened.db, order('january', '2026-01-15T03:20:00.000Z'));
  });

  it.each(['2026-13-45T00:00:00Z', '2026-01-01T00:00:00+99:00'])(
    'refuses %s rather than comparing it as text',
    (bound) => {
      // Passed through, such a bound is a lexicographic comparison against
      // canonical rows: `2026-13-45…` sits past every real date, so the
      // answer is an empty list a caller cannot tell from a window that
      // genuinely held nothing.
      expect(() => listPurchases(opened.db, { from: bound })).toThrow(
        UnreadableOrderedAtBoundError
      );
      expect(() => listSolvableCharges(opened.db, { to: bound })).toThrow(
        UnreadableOrderedAtBoundError
      );
    }
  );
});
