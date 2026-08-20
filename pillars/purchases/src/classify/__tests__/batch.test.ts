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

import type { BatchableItem } from '../batch.js';

const line = (over: Partial<BatchableItem> = {}): BatchableItem => ({
  id: 'item-1',
  source: 'woolworths',
  sku: null,
  skuScheme: null,
  name: 'WW Cage Free Eggs XL 12pk 700g',
  merchantEntityId: null,
  merchantEntityName: 'Woolworths',
  ...over,
});

/** The stored column pair, so a case states the namespace it means. */
type StoredSku = Pick<BatchableItem, 'sku' | 'skuScheme'>;

/** Amazon's catalogue id: the same product wherever it turns up. */
const asin = (value: string): StoredSku => ({ sku: value, skuScheme: 'asin' });

/** An identifier only the issuing merchant defines. */
const article = (value: string): StoredSku => ({ sku: value, skuScheme: 'merchant' });

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
        ...asin('B0DSVZQ8P5'),
        name: 'Espresso Tamping Station',
      }),
      // The same ASIN listed under a slightly different title, which Amazon
      // does. The identifier is what identifies it.
      line({
        id: 'b',
        source: 'amazon',
        ...asin('B0DSVZQ8P5'),
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
        line({ id: 'a', source: 'amazon', ...asin('B01'), name: 'Cable' }),
        line({ id: 'b', source: 'amazon', ...asin('B02'), name: 'Cable' }),
      ])
    ).toHaveLength(2);
  });

  it('treats a blank sku as no sku rather than as a shared one', () => {
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', ...asin('   '), name: 'Air fryer' }),
      line({ id: 'b', source: 'amazon', ...asin(''), name: 'Bread maker' }),
    ]);
    expect(candidates).toHaveLength(2);
  });
});

describe('across sources', () => {
  it('never shares a decision between two merchants', () => {
    // An article number at one merchant means nothing at another, and a
    // product name can genuinely collide.
    expect(batchingKey(line({ source: 'woolworths', ...article('6015322') }))).not.toBe(
      batchingKey(line({ source: 'amazon', ...article('6015322') }))
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

  it('shares one decision for an ASIN across the two Amazon exports', () => {
    // The bundle splits Amazon's catalogue over a physical and a digital
    // export, so the same ASIN arrives under two source ids. Two decisions
    // is the same product asked about twice, at twice the cost, with two
    // answers free to disagree.
    const candidates = toCandidates([
      line({ id: 'a', source: 'amazon', ...asin('B0DSVZQ8P5'), name: 'The Way of Kings' }),
      line({
        id: 'b',
        source: 'amazon-digital',
        ...asin('B0DSVZQ8P5'),
        name: 'The Way of Kings (Kindle)',
      }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.itemIds).toEqual(['a', 'b']);
    // No one source bounds the batch, so the prompt is not told one does.
    expect(candidates[0]?.source).toBeNull();
  });

  it('never shares a decision between two schemes that print the same string', () => {
    // A scheme is half the identifier. `6015322` as an Amazon catalogue id
    // and `6015322` as a grocer's article number are two products, and
    // merging them is the direction nothing downstream can see.
    expect(batchingKey(line({ source: 'amazon', ...asin('6015322') }))).not.toBe(
      batchingKey(line({ source: 'woolworths', ...article('6015322') }))
    );
  });

  it('does not widen a cross-source scheme past the identifier it states', () => {
    // Dropping the scope must not drop the string with it.
    expect(batchingKey(line({ source: 'amazon', ...asin('B0DSVZQ8P5') }))).not.toBe(
      batchingKey(line({ source: 'amazon-digital', ...asin('B0FCSJTKJ8') }))
    );
  });

  it('treats a sku stated with no scheme as no identifier at all', () => {
    // Half the pair is not an identity: nothing can say what namespace the
    // string is in, and keying on it bare is the merge the pair prevents. So
    // the two fall back to their printed names and stay apart.
    expect(
      batchingKey(line({ source: 'amazon', sku: 'B0DSVZQ8P5', skuScheme: null, name: 'Tamper' }))
    ).not.toBe(
      batchingKey(line({ source: 'amazon', sku: 'B0DSVZQ8P5', skuScheme: null, name: 'Kettle' }))
    );
  });

  it('cannot be collided by a sku that looks like another key', () => {
    // Joining the parts on a delimiter is not injective, and a merchant is
    // free to print that delimiter inside an identifier.
    expect(batchingKey(line({ source: 'amazon', ...article('name x') }))).not.toBe(
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
