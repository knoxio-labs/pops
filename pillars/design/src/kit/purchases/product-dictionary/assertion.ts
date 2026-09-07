import { ANY_SOURCE } from './types';

import type { DictionaryAlias, DictionaryProduct } from '@/fixtures/purchases-dictionary';

import type { AssertionFilter, DictionaryFilterState } from './types';

/** How much of a product a person has vouched for. */
export type ProductAssertion = 'asserted' | 'partAsserted' | 'proposed';

/** True where a human asserted this wording is that product. */
export function aliasIsAsserted(alias: DictionaryAlias): boolean {
  return alias.confirmedAt !== null;
}

/** True where a human typed this product's name, putting it beyond the pass's reach. */
export function productIsNamed(product: DictionaryProduct): boolean {
  return product.labelConfirmedAt !== null;
}

/**
 * True where forgetting this one wording would take a human-named product
 * with it — the last wording reaching a named product holds the name up, and
 * a product left with none is deleted in the same write.
 */
export function forgettingEndsNamedProduct(
  product: DictionaryProduct,
  alias: DictionaryAlias
): boolean {
  return (
    productIsNamed(product) && product.aliases.length === 1 && product.aliases[0]?.id === alias.id
  );
}

/**
 * A product reads `asserted` only where every wording reaching it was
 * asserted: one unasserted wording means the group still holds lines on a
 * pass's proposal, and half a merge presented as a fact is the error this
 * dictionary is arranged against.
 */
export function productAssertion(aliases: readonly DictionaryAlias[]): ProductAssertion {
  const asserted = aliases.filter(aliasIsAsserted).length;
  if (asserted === 0) return 'proposed';
  return asserted === aliases.length ? 'asserted' : 'partAsserted';
}

/** Every source the loaded dictionary prints, ascending, for the filter bar. */
export function sourcesOf(products: readonly DictionaryProduct[]): string[] {
  const sources = new Set<string>();
  for (const product of products) {
    for (const alias of product.aliases) sources.add(alias.source);
  }
  return [...sources].toSorted();
}

function matchesAssertion(
  aliases: readonly DictionaryAlias[],
  assertion: AssertionFilter
): boolean {
  if (assertion === 'all') return true;
  return aliases.every(aliasIsAsserted) === (assertion === 'asserted');
}

/**
 * One product against the filter bar. The source narrows the wordings the
 * assertion question is then asked about, mirroring the server's
 * `GET /products?source=…&confirmed=…`: a product no wording reaches under
 * the chosen source is withheld, the same way the server withholds it.
 */
export function matchesDictionaryFilters(
  product: DictionaryProduct,
  filters: DictionaryFilterState
): boolean {
  const scoped =
    filters.source === ANY_SOURCE
      ? product.aliases
      : product.aliases.filter((alias) => alias.source === filters.source);
  if (scoped.length === 0) return false;
  return matchesAssertion(scoped, filters.assertion);
}
