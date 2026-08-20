import { ANY_SOURCE } from './types.js';

/**
 * Who a dictionary entry belongs to — a pass, or a person.
 *
 * `confirmedAt` is the whole boundary between the two, the same marker
 * `purchase_item_tags.confirmedAt` and `purchase_items.kindConfirmedAt`
 * carry. Null means the proposal pass owns the wording and may retire it once
 * no line prints it; non-null means somebody asserted it and the pass may not
 * touch it. A surface that flattens the two re-creates the failure the column
 * was added to prevent, so the distinction is derived once here and shown
 * everywhere an entry is shown.
 *
 * The filtering below mirrors `listProducts` in the pillar's
 * `src/db/services/product-dictionary.ts` rather than being sent to it. The
 * whole dictionary arrives in one unpaged read — the route has no `limit` on
 * purpose — and filtering the loaded set is what keeps the source picker
 * offering every source rather than only the sources that survived its own
 * last answer. Keeping the rule identical to the server's is what stops the
 * page and the API disagreeing about which products are unfinished.
 */
import type {
  AssertionFilter,
  DictionaryAlias,
  DictionaryFilterState,
  DictionaryProduct,
} from './types.js';

/** How much of a product a person has vouched for. */
export type ProductAssertion = 'asserted' | 'partAsserted' | 'proposed';

/** True where a human asserted this wording is that product. */
export function aliasIsAsserted(alias: DictionaryAlias): boolean {
  return alias.confirmedAt !== null;
}

/**
 * A product reads `asserted` only where **every** wording reaching it was
 * asserted, which is the rule the leaderboard's `confirmed` flag uses one
 * layer down: one unasserted wording means the group still holds lines on a
 * pass's proposal, and half a merge presented as a fact is the error this
 * whole dictionary is arranged against.
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
 * One product against the filter bar.
 *
 * The source narrows the wordings the assertion question is then asked about,
 * exactly as the server does it: asking "is this finished" about a product
 * while looking at one source's wordings is a different question from asking
 * it about all of them, and a page that answered the second while the server
 * answered the first would disagree with `GET /products?source=…&confirmed=…`
 * about the same row. A product no wording reaches is withheld here for the
 * same reason the server withholds it — a label nothing resolves to is not a
 * dictionary entry a reader can act on.
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
