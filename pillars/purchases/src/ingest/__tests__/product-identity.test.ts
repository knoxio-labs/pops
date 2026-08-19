/**
 * What product identity each shipped adapter can actually state.
 *
 * This is a measurement, not a preference, and it is the substrate every
 * repeat-purchase question is built on: the sources that name a product name
 * it in their own catalogue's namespace, and the rest name none.
 *
 * | adapter          | states                                              |
 * | ---------------- | --------------------------------------------------- |
 * | `amazon`         | an ASIN per line, in the `asin` scheme               |
 * | `amazon-digital` | the same, from the same `ASIN` column                |
 * | `woolworths`     | nothing — a receipt row is description and amount    |
 * | `receipt`        | nothing, because the extraction schema refuses to
 *                      let a vision model infer an identifier it cannot
 *                      check                                              |
 *
 * The two "nothing" rows are the load-bearing ones and the reason this file
 * exists rather than a sentence in a README. An adapter that started minting
 * an identifier from a printed name — a plausible-looking improvement —
 * would make every consumer treat a guess as a merchant's word, and the
 * grouping it fed would merge products silently. Adding one has to be a
 * deliberate act that edits this file.
 */
import { describe, expect, it } from 'vitest';

import { ADAPTERS, amazonDigitalItems, amazonItems } from './adapter-fixtures.js';

import type { CreateItemInput } from '../../db/services/purchase-input.js';

/** Which adapters this measurement says state an identity, and in what scheme. */
const STATED_SCHEME: Readonly<Record<string, string | null>> = {
  amazon: 'asin',
  'amazon-digital': 'asin',
  woolworths: null,
  receipt: null,
};

describe.each(ADAPTERS)('the %s adapter', (name, items) => {
  it('produces lines to assert on at all', () => {
    // The assertions below are about absence for two of three adapters, so
    // without this they pass vacuously the day a fixture stops parsing.
    expect(items().length, name).toBeGreaterThan(0);
  });

  it('states an identity only in the scheme it can back', () => {
    const expected = STATED_SCHEME[name];
    const schemes = [...new Set(items().map((item) => item.sku?.scheme ?? null))];
    expect(schemes, name).toEqual([expected]);
  });

  it('never states half of an identity', () => {
    // Unreachable through the type, which is the point: if the shape ever
    // loosens back into two fields, this is what notices.
    for (const item of items()) {
      if (item.sku == null) continue;
      expect(item.sku.value, name).not.toBe('');
    }
  });
});

const NAMING_ADAPTERS: readonly (readonly [string, () => readonly CreateItemInput[]])[] = [
  ['amazon', amazonItems],
  ['amazon-digital', amazonDigitalItems],
];

describe.each(NAMING_ADAPTERS)('the %s adapter, which names a product', (name, items) => {
  it('carries the ASIN through verbatim', () => {
    const identities = items()
      .map((item) => item.sku)
      .filter((sku) => sku != null);
    expect(identities.length, name).toBeGreaterThan(0);
    expect(
      identities.every((sku) => /^[A-Z0-9]{10}$/u.test(sku.value)),
      name
    ).toBe(true);
  });

  it('names every line, because the export states one on every row', () => {
    // The asymmetry is the finding: the sources that have a namespace use it
    // for everything they sell, and the other two have nothing to use.
    expect(
      items().filter((item) => item.sku == null),
      name
    ).toEqual([]);
  });
});
