/**
 * What product identity each shipped adapter can actually state.
 *
 * This is a measurement, not a preference, and it is the substrate every
 * repeat-purchase question is built on: one source of three names a product,
 * and it names it in its own catalogue's namespace.
 *
 * | adapter      | states                                                  |
 * | ------------ | ------------------------------------------------------- |
 * | `amazon`     | an ASIN per line, in the `asin` scheme                   |
 * | `woolworths` | nothing — a receipt row is description and amount        |
 * | `receipt`    | nothing, because the extraction schema refuses to let a
 *                  vision model infer an identifier it cannot check         |
 *
 * The two "nothing" rows are the load-bearing ones and the reason this file
 * exists rather than a sentence in a README. An adapter that started minting
 * an identifier from a printed name — a plausible-looking improvement —
 * would make every consumer treat a guess as a merchant's word, and the
 * grouping it fed would merge products silently. Adding one has to be a
 * deliberate act that edits this file.
 */
import { describe, expect, it } from 'vitest';

import { ADAPTERS, amazonItems } from './adapter-fixtures.js';

/** Which adapters this measurement says state an identity, and in what scheme. */
const STATED_SCHEME: Readonly<Record<string, string | null>> = {
  amazon: 'asin',
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

describe('the one adapter that names a product', () => {
  it('carries the ASIN through verbatim', () => {
    const identities = amazonItems()
      .map((item) => item.sku)
      .filter((sku) => sku != null);
    expect(identities.length).toBeGreaterThan(0);
    expect(identities.every((sku) => /^[A-Z0-9]{10}$/u.test(sku.value))).toBe(true);
  });

  it('names every line, because the export states one on every row', () => {
    // The asymmetry is the finding: the source that has a namespace uses it
    // for everything it sells, and the other two have nothing to use.
    expect(amazonItems().filter((item) => item.sku == null)).toEqual([]);
  });
});
