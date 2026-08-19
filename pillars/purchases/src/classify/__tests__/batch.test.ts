/**
 * The batching key.
 *
 * The failure this file exists to prevent is not hypothetical and not
 * subtle in its effect, only in its cause: keying on `(source, sku)` looks
 * right, and collapses every line the sources do not give a sku for —
 * ~490 Woolworths lines and every uploaded receipt — into one decision per
 * merchant. That decision would be `consumable` and it would erase the
 * handful of grocery durables the inventory fan-out exists to catch.
 */
import { describe, expect, it } from 'vitest';

import { batchingKey, intoBatches, normalisedName, toCandidates } from '../batch.js';

import type { ProductIdentity } from '../../contract/types/purchase.js';
import type { BatchableItem } from '../batch.js';

const line = (over: Partial<BatchableItem> = {}): BatchableItem => ({
  id: 'item-1',
  source: 'woolworths',
  sku: null,
  name: 'WW Cage Free Eggs XL 12pk 700g',
  merchantEntityId: null,
  merchantEntityName: 'Woolworths',
  ...over,
});

/** Amazon's catalogue id: the same product wherever it turns up. */
const asin = (value: string): ProductIdentity => ({ value, scheme: 'asin' });

/** An identifier only the issuing merchant defines. */
const article = (value: string): ProductIdentity => ({ value, scheme: 'merchant' });

/** The real Everyday Rewards export: mostly food, two things that are not. */
const GROCERY_SHOP: readonly BatchableItem[] = [
  line({ id: 'i1', name: 'Essentials Grated Parmesan Cheese 100g' }),
  line({ id: 'i2', name: 'WW Cage Free Eggs XL 12pk 700g' }),
  line({ id: 'i3', name: 'WW Cheese Slices Smoky 250g' }),
  line({ id: 'i4', name: 'Woolworths Turkish Rolls 400g Pk 4' }),
  line({ id: 'i5', name: 'Wiltshire Impulse Citrus Juicer' }),
  line({ id: 'i6', name: '6015322 Barware Set/4' }),
];

describe('a source that states no sku', () => {
  it('gives every distinct product its own decision', () => {
    // The bug: one key for all six, so one verdict for a whole merchant.
    const candidates = toCandidates(GROCERY_SHOP);
    expect(candidates).toHaveLength(6);
  });

  it('keeps the grocery durables separable from the food around them', () => {
    const keys = new Map(toCandidates(GROCERY_SHOP).map((c) => [c.name, c.key]));
    const juicer = keys.get('Wiltshire Impulse Citrus Juicer');
    const barware = keys.get('6015322 Barware Set/4');
    const cheese = keys.get('WW Cheese Slices Smoky 250g');

    expect(juicer).toBeDefined();
    expect(new Set([juicer, barware, cheese]).size).toBe(3);
  });

  it('still groups the same product bought on different days', () => {
    // The whole point of grouping: one answer, however many shops it
    // appeared in. Different ids, same name.
    const candidates = toCandidates([
      line({ id: 'a', name: 'WW Cheese Slices Smoky 250g' }),
      line({ id: 'b', name: 'WW Cheese Slices Smoky 250g' }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.itemIds).toEqual(['a', 'b']);
  });

  it('groups through the punctuation and casing a till varies', () => {
    const candidates = toCandidates([
      line({ id: 'a', name: 'WW Smky Chip Chdr TstyShrd Cheese 250g' }),
      line({ id: 'b', name: 'WW SMKY CHIP CHDR  TSTYSHRD CHEESE 250G' }),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it('does not group two sizes of the same product', () => {
    // Digits survive normalisation on purpose: 1L and 2L are two products
    // and a shared verdict would be a shared price too.
    expect(
      toCandidates([
        line({ id: 'a', name: 'WW Full Cream Milk 1L' }),
        line({ id: 'b', name: 'WW Full Cream Milk 2L' }),
      ])
    ).toHaveLength(2);
  });

  it('gives a line with no readable name a key that groups nothing', () => {
    const candidates = toCandidates([
      line({ id: 'a', name: '***' }),
      line({ id: 'b', name: '###' }),
    ]);
    // Both normalise to nothing. Falling back to a shared empty-name key
    // would be the same collapse one level down.
    expect(candidates).toHaveLength(2);
  });
});

describe('a source that states a sku', () => {
  it('groups repeat purchases of one ASIN into a single decision', () => {
    const candidates = toCandidates([
      line({
        id: 'a',
        source: 'amazon',
        sku: asin('B0DSVZQ8P5'),
        name: 'Espresso Tamping Station',
      }),
      // The same ASIN listed under a slightly different title, which Amazon
      // does. The identifier is what identifies it.
      line({
        id: 'b',
        source: 'amazon',
        sku: asin('B0DSVZQ8P5'),
        name: 'Espresso Tamper Station 58mm',
      }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.itemIds).toEqual(['a', 'b']);
  });

  it('prefers the sku over the name', () => {
    // Two products a merchant chose to name identically are still two
    // products if it gave them different identifiers.
    expect(
      toCandidates([
        line({ id: 'a', source: 'amazon', sku: asin('B01'), name: 'Cable' }),
        line({ id: 'b', source: 'amazon', sku: asin('B02'), name: 'Cable' }),
      ])
    ).toHaveLength(2);
  });

  it('treats a blank sku as no sku rather than as a shared one', () => {
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', sku: asin('   '), name: 'Air fryer' }),
      line({ id: 'b', source: 'amazon', sku: asin(''), name: 'Bread maker' }),
    ]);
    expect(candidates).toHaveLength(2);
  });
});

describe('how far an identifier reaches', () => {
  it('groups one ASIN across two sources, because that is what an ASIN means', () => {
    // The DSAR export and an emailed Amazon confirmation are two sources
    // quoting one catalogue. Splitting them would ask the model the same
    // question twice and let it answer differently.
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', sku: asin('B0DSVZQ8P5'), name: 'Tamping Station' }),
      line({ id: 'b', source: 'amazon-email', sku: asin('B0DSVZQ8P5'), name: 'Tamping Station' }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.itemIds).toEqual(['a', 'b']);
  });

  it('names no merchant for a group that spans two of them', () => {
    // The first line's merchant is a fact about that line. Reporting it as
    // the group's is how it reaches the classification prompt as evidence
    // about a product bought somewhere else.
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', sku: asin('B0DSVZQ8P5'), name: 'Tamping Station' }),
      line({ id: 'b', source: 'amazon-email', sku: asin('B0DSVZQ8P5'), name: 'Tamping Station' }),
    ]);
    expect(candidates[0]?.source).toBeNull();
  });

  it('keeps the merchant of a group that came from one', () => {
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', sku: asin('B0DSVZQ8P5'), name: 'Tamping Station' }),
      line({ id: 'b', source: 'amazon', sku: asin('B0DSVZQ8P5'), name: 'Tamper Station 58mm' }),
    ]);
    expect(candidates[0]?.source).toBe('amazon');
  });

  it('never groups a merchant-local identifier across two sources', () => {
    // `4471` at a hardware store and `4471` at a grocer are two products
    // that share a string, and nothing but the scheme says so.
    expect(batchingKey(line({ source: 'woolworths', sku: article('4471') }))).not.toBe(
      batchingKey(line({ source: 'bunnings', sku: article('4471') }))
    );
  });

  it('does not let a merchant-local identifier collide with a cross-source one', () => {
    expect(batchingKey(line({ source: 'amazon', sku: article('B0DSVZQ8P5') }))).not.toBe(
      batchingKey(line({ source: 'amazon', sku: asin('B0DSVZQ8P5') }))
    );
  });
});

describe('across sources', () => {
  it('never shares a decision between two merchants', () => {
    // An article number at one merchant means nothing at another, and a
    // product name can genuinely collide.
    expect(batchingKey(line({ source: 'woolworths', sku: article('6015322') }))).not.toBe(
      batchingKey(line({ source: 'amazon', sku: article('6015322') }))
    );

    expect(batchingKey(line({ source: 'woolworths', name: 'Milk' }))).not.toBe(
      batchingKey(line({ source: 'receipt', name: 'Milk' }))
    );
  });

  it('never shares a decision between two shops that share the receipt source', () => {
    // Every uploaded receipt is written under one source id whatever shop
    // printed it, so the source alone does not say two lines came from the
    // same till — and one decision covering both would be a decision about
    // two different products.
    expect(
      batchingKey(line({ source: 'receipt', name: 'LATTE', merchantEntityName: 'Kettle Black' }))
    ).not.toBe(
      batchingKey(line({ source: 'receipt', name: 'LATTE', merchantEntityName: 'Patricia' }))
    );
  });

  it('still shares one decision across the stores of a single merchant export', () => {
    // The Woolworths adapter labels each store — `Woolworths 1034 Canterbury
    // Plaza` — but one chain prints one catalogue, so splitting a product per
    // branch would multiply the same decision by however many shops the
    // household uses.
    expect(
      batchingKey(
        line({ source: 'woolworths', name: 'Milk 2L', merchantEntityName: 'Woolworths 1034' })
      )
    ).toBe(
      batchingKey(
        line({ source: 'woolworths', name: 'Milk 2L', merchantEntityName: 'Woolworths 2245' })
      )
    );
  });

  it('cannot be collided by a sku that looks like another key', () => {
    // Joining the parts on a delimiter is not injective, and a merchant is
    // free to print that delimiter inside an identifier.
    expect(batchingKey(line({ source: 'amazon', sku: article('name x') }))).not.toBe(
      batchingKey(line({ source: 'amazon', sku: null, name: 'x' }))
    );
  });
});

describe('normalisedName', () => {
  it('collapses everything that is not a letter or digit', () => {
    expect(normalisedName('  WW  Cheese-Slices/Smoky_250g! ')).toBe('ww cheese slices smoky 250g');
  });

  it('returns empty for a name made entirely of punctuation', () => {
    expect(normalisedName('--- *** ---')).toBe('');
  });
});

describe('intoBatches', () => {
  it('preserves order and covers every element exactly once', () => {
    const batched = intoBatches([1, 2, 3, 4, 5], 2);
    expect(batched).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for nothing', () => {
    expect(intoBatches([], 10)).toEqual([]);
  });

  it('refuses a batch size of zero rather than looping forever', () => {
    expect(() => intoBatches([1], 0)).toThrow(/at least 1/);
  });
});
