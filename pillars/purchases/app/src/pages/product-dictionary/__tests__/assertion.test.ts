import { describe, expect, it } from 'vitest';

import {
  aliasIsAsserted,
  matchesDictionaryFilters,
  productAssertion,
  sourcesOf,
} from '../assertion';

import type { DictionaryAlias, DictionaryProduct } from '../types';

function alias(overrides: Partial<DictionaryAlias> = {}): DictionaryAlias {
  return {
    id: 'alias-1',
    scopeKey: 'receipt|entity:woolies',
    source: 'receipt',
    normalisedName: 'chk brst 1kg',
    printedName: 'CHK BRST 1KG',
    confirmedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function product(aliases: DictionaryAlias[]): DictionaryProduct {
  return {
    id: 'product-1',
    label: 'Chicken breast 1kg',
    createdAt: '2026-05-01T00:00:00.000Z',
    aliases,
  };
}

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

  // One unasserted wording means the group still holds lines on a pass's
  // proposal. Reading that as asserted is the half-merge-presented-as-fact
  // the dictionary exists to prevent.
  it('calls a half-asserted product part-asserted rather than asserted', () => {
    expect(productAssertion([asserted, proposal])).toBe('partAsserted');
  });

  it('calls a product nobody has vouched for proposed', () => {
    expect(productAssertion([proposal, alias({ id: 'c' })])).toBe('proposed');
  });

  // `[].every()` is true, so a count-free implementation would call a product
  // no wording reaches "asserted" — a claim about evidence that does not exist.
  it('does not read an empty wording list as asserted', () => {
    expect(productAssertion([])).toBe('proposed');
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

  // The server's two `confirmed` answers are complements, so unfinished work
  // has exactly one place to be found: a product with one asserted wording and
  // one proposal answers `unasserted` and nothing else.
  it('sends a half-asserted product to the unfinished side and not the asserted one', () => {
    const half = product([asserted, proposal]);
    expect(matchesDictionaryFilters(half, { source: 'all', assertion: 'unasserted' })).toBe(true);
    expect(matchesDictionaryFilters(half, { source: 'all', assertion: 'asserted' })).toBe(false);
  });

  // Mirrors `listProducts`: the source narrows the wordings before the
  // assertion question is asked of them, so the page and
  // `GET /products?source=…&confirmed=…` answer the same about the same row.
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
