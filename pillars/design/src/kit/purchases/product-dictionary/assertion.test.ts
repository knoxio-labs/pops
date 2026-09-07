import {
  aliasIsAsserted,
  forgettingEndsNamedProduct,
  matchesDictionaryFilters,
  productAssertion,
  productIsNamed,
  sourcesOf,
} from '@/kit/purchases/product-dictionary/assertion';
import { describe, expect, it } from 'vitest';

import type { DictionaryAlias, DictionaryProduct } from '@/fixtures/purchases-dictionary';

function alias(overrides: Partial<DictionaryAlias> = {}): DictionaryAlias {
  return {
    id: 'alias-1',
    scopeKey: 'receipt:chk brst 1kg',
    source: 'receipt',
    normalisedName: 'chk brst 1kg',
    printedName: 'CHK BRST 1KG',
    confirmedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function product(
  aliases: DictionaryAlias[],
  overrides: Partial<DictionaryProduct> = {}
): DictionaryProduct {
  return {
    id: 'product-1',
    label: 'Chicken breast 1kg',
    labelConfirmedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    aliases,
    ...overrides,
  };
}

const NAMED = { labelConfirmedAt: '2026-05-04T00:00:00.000Z' } as const;

const asserted = alias({ id: 'alias-asserted', confirmedAt: '2026-05-02T00:00:00.000Z' });
const proposal = alias({ id: 'alias-proposed', confirmedAt: null });

describe('aliasIsAsserted', () => {
  it('reads confirmedAt as the whole boundary between a pass and a person', () => {
    expect(aliasIsAsserted(asserted)).toBe(true);
    expect(aliasIsAsserted(proposal)).toBe(false);
  });
});

describe('productAssertion', () => {
  it('calls a product asserted only when every wording was', () => {
    expect(productAssertion([asserted])).toBe('asserted');
    expect(
      productAssertion([asserted, alias({ id: 'b', confirmedAt: '2026-05-03T00:00:00.000Z' })])
    ).toBe('asserted');
  });

  it('calls a half-asserted product part-asserted rather than asserted', () => {
    expect(productAssertion([asserted, proposal])).toBe('partAsserted');
  });

  it('calls a product nobody has vouched for proposed', () => {
    expect(productAssertion([proposal, alias({ id: 'c' })])).toBe('proposed');
  });

  it('does not read an empty wording list as asserted', () => {
    expect(productAssertion([])).toBe('proposed');
  });
});

describe('productIsNamed', () => {
  it('reads labelConfirmedAt as the boundary between a till abbreviation and a name', () => {
    expect(productIsNamed(product([proposal]))).toBe(false);
    expect(productIsNamed(product([proposal], NAMED))).toBe(true);
  });
});

describe('forgettingEndsNamedProduct', () => {
  const only = alias({ id: 'only' });

  it('is true for the last wording reaching a product somebody named', () => {
    expect(forgettingEndsNamedProduct(product([only], NAMED), only)).toBe(true);
  });

  it('is false while another wording still reaches the named product', () => {
    const shared = product([only, alias({ id: 'second' })], NAMED);
    expect(forgettingEndsNamedProduct(shared, only)).toBe(false);
  });

  it('is false for the only wording of a product nobody named', () => {
    expect(forgettingEndsNamedProduct(product([only]), only)).toBe(false);
  });

  it('does not mistake an asserted wording for a named product', () => {
    const confirmed = alias({ id: 'only', confirmedAt: '2026-05-02T00:00:00.000Z' });
    expect(forgettingEndsNamedProduct(product([confirmed]), confirmed)).toBe(false);
  });

  it('is false for a wording the product does not hold', () => {
    expect(forgettingEndsNamedProduct(product([only], NAMED), alias({ id: 'elsewhere' }))).toBe(
      false
    );
  });
});

describe('sourcesOf', () => {
  it('collects every source the dictionary prints, deduplicated and ordered', () => {
    const products = [
      product([alias({ source: 'receipt' }), alias({ id: 'b', source: 'amazon' })]),
      { ...product([alias({ id: 'c', source: 'receipt' })]), id: 'product-2' },
    ];
    expect(sourcesOf(products)).toEqual(['amazon', 'receipt']);
  });

  it('returns nothing for a dictionary with no products', () => {
    expect(sourcesOf([])).toEqual([]);
  });
});

describe('matchesDictionaryFilters', () => {
  it('keeps everything when neither axis is narrowed', () => {
    expect(
      matchesDictionaryFilters(product([asserted, proposal]), { source: 'all', assertion: 'all' })
    ).toBe(true);
  });

  it('keeps a product holding at least one wording under the source', () => {
    const mixed = product([alias({ source: 'receipt' }), alias({ id: 'b', source: 'amazon' })]);
    expect(matchesDictionaryFilters(mixed, { source: 'amazon', assertion: 'all' })).toBe(true);
    expect(matchesDictionaryFilters(mixed, { source: 'aliexpress', assertion: 'all' })).toBe(false);
  });

  it('sends a half-asserted product to the unfinished side and not the asserted one', () => {
    const half = product([asserted, proposal]);
    expect(matchesDictionaryFilters(half, { source: 'all', assertion: 'unasserted' })).toBe(true);
    expect(matchesDictionaryFilters(half, { source: 'all', assertion: 'asserted' })).toBe(false);
  });

  it('asks the assertion question only of the wordings the source kept', () => {
    const crossSource = product([
      alias({ id: 'a', source: 'receipt', confirmedAt: '2026-05-02T00:00:00.000Z' }),
      alias({ id: 'b', source: 'amazon', confirmedAt: null }),
    ]);
    expect(
      matchesDictionaryFilters(crossSource, { source: 'receipt', assertion: 'asserted' })
    ).toBe(true);
    expect(matchesDictionaryFilters(crossSource, { source: 'amazon', assertion: 'asserted' })).toBe(
      false
    );
  });

  it('withholds a product no wording reaches, as the listing does', () => {
    expect(matchesDictionaryFilters(product([]), { source: 'all', assertion: 'all' })).toBe(false);
  });
});
