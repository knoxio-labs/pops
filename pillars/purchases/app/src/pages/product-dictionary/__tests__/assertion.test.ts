import { describe, expect, it } from 'vitest';

import {
  aliasIsAsserted,
  forgettingEndsNamedProduct,
  matchesDictionaryFilters,
  productAssertion,
  productIsNamed,
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

describe('productIsNamed', () => {
  it('reads labelConfirmedAt as the boundary between a till abbreviation and a name', () => {
    expect(productIsNamed(product([proposal]))).toBe(false);
    expect(productIsNamed(product([proposal], NAMED))).toBe(true);
  });
});

describe('forgettingEndsNamedProduct', () => {
  const only = alias({ id: 'only' });

  // The whole point: this click deletes the product too, and no pass can put
  // a typed name back.
  it('is true for the last wording reaching a product somebody named', () => {
    expect(forgettingEndsNamedProduct(product([only], NAMED), only)).toBe(true);
  });

  // The product survives, so nothing unrecoverable happens and the correction
  // stays the one click every other recoverable correction is.
  it('is false while another wording still reaches the named product', () => {
    const shared = product([only, alias({ id: 'second' })], NAMED);
    expect(forgettingEndsNamedProduct(shared, only)).toBe(false);
  });

  // An unnamed product wears the wording that minted it, so the next pass
  // re-mints an identical product from the lines that print it.
  it('is false for the only wording of a product nobody named', () => {
    expect(forgettingEndsNamedProduct(product([only]), only)).toBe(false);
  });

  // Asserting a wording says the wording is that product; it says nothing
  // about who chose the name, which is the thing that cannot be rebuilt.
  it('does not mistake an asserted wording for a named product', () => {
    const confirmed = alias({ id: 'only', confirmedAt: '2026-05-02T00:00:00.000Z' });
    expect(forgettingEndsNamedProduct(product([confirmed]), confirmed)).toBe(false);
  });

  // A stale row handed a wording from a different product must not arm a
  // control that would then delete neither of the things it named.
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
