/**
 * No ingest adapter classifies.
 *
 * `purchase_items.kind` and `purchase_item_tags` are POPS judgements about
 * what a thing *is*. No shipped source states either — the Amazon DSAR
 * bundle has 28 columns and none is a category, and a till receipt prints
 * product names, not taxonomies — so an adapter that emitted one would be
 * inferring, and an inference written into the operative column is
 * indistinguishable from a fact the merchant stated.
 *
 * That rule is a sentence in three docstrings and nothing else enforces it:
 * `purchase_item_tags` deliberately does not constrain its values, and
 * `kind`'s CHECK only polices the vocabulary. So this file runs every
 * shipped adapter over its own fixtures and asserts the columns come out
 * empty. It is the regression that catches the rule eroding, which is
 * exactly how the table filled up with promo prose the first time.
 *
 * The rule has one deliberate exception: an adapter MAY set `kind` where its
 * source states it outright, which is transcription rather than inference.
 * `Digital Content Orders.csv` does, so `amazon-digital` carries a case in
 * {@link TRANSCRIBED_KIND} rather than a waiver — and that case pins the
 * value, so an adapter drifting into a second kind is caught here too.
 */
import { describe, expect, it } from 'vitest';

import { ADAPTERS, amazonItems, receiptItems, woolworthsItems } from './adapter-fixtures.js';

import type { ItemKind } from '../../contract/constants.js';

/**
 * The kind a source states outright, for the adapters whose source does.
 * Every adapter absent from this map must state none — anything it wrote
 * there it would have had to infer.
 */
const TRANSCRIBED_KIND: Readonly<Record<string, ItemKind | undefined>> = {
  'amazon-digital': 'digital',
};

describe.each(ADAPTERS)('the %s adapter', (name, items) => {
  it('produces lines to assert on at all', () => {
    // Without this the two assertions below pass vacuously the day a
    // fixture stops parsing, which is the failure mode of every "assert
    // nothing is present" test.
    expect(items().length, name).toBeGreaterThan(0);
  });

  it('states an item kind only where its source states one outright', () => {
    const kinds = [...new Set(items().map((item) => item.kind))];
    expect(kinds, name).toEqual([TRANSCRIBED_KIND[name]]);
  });

  it('states no item tag', () => {
    expect(items().flatMap((item) => item.tags ?? [])).toEqual([]);
  });
});

describe('what the adapters do state instead', () => {
  it('keeps the Woolworths promo wording as an ordered note', () => {
    // The same information, in the column that describes what it is. This
    // is the half of the rule that would otherwise be untested: "writes no
    // tag" is also satisfied by throwing the evidence away.
    expect(woolworthsItems().flatMap((item) => item.notes ?? [])).toContain(
      'PRICE REDUCED BY $7.26 each'
    );
  });

  it("keeps the drop-zone's printed unit note", () => {
    expect(receiptItems().flatMap((item) => item.notes ?? [])).toEqual(['2 @ $7.50']);
  });

  it("keeps Amazon's product condition out of the category column", () => {
    const items = amazonItems();
    expect(items.map((item) => item.merchantCategory).filter((v) => v !== undefined)).toEqual([]);
    expect(items.some((item) => item.merchantCondition === 'New')).toBe(true);
  });
});
