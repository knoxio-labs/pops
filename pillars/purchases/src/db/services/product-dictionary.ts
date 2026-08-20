/**
 * Reading the learned product dictionary.
 *
 * **What it learns from.** Two things, and deliberately nothing else:
 *
 * 1. *Repetition.* A printed wording that appears on a line is minted as an
 *    entry pointing at a product of its own, by the pass in
 *    `product-dictionary-proposals.ts`. That is not a guess — it is the
 *    grouping every aggregate already does, written down so it can be
 *    pointed at.
 * 2. *Assertion.* A human repoints one entry at another entry's product
 *    (`product-dictionary-writes.ts`), and from then on both wordings resolve
 *    to it, for every line already stored and every line that arrives later.
 *    That is the mapping being learned, and it is learned once.
 *
 * **What it will not attempt.** It will not infer that `CHK BRST 1KG` and
 * `Chicken Breast 1kg` are one product. Nothing in this pillar's data says
 * they are: the merchants state no identifier, the prices differ, and the
 * only signal available is string similarity, which is precisely the signal
 * that cannot tell `MILK 1L` from `MILK 2L`. Two products collapsing into one
 * corrupts spend attribution in a way no later reader can see, where leaving
 * them apart is a visible non-answer. So the lookup is exact, the merge is a
 * human's, and the dictionary's job is to make that human's answer permanent
 * rather than to invent it.
 *
 * Split three ways on the seam `purchase-reads`/`purchase-writes` already
 * uses, plus the pass, because the three fail differently: a read that groups
 * wrongly is a wrong answer, a human's edit that half-lands is corruption, and
 * a pass that overreaches destroys somebody's decision.
 */
import { eq } from 'drizzle-orm';

import { purchaseProductAliases, purchaseProducts } from '../schema.js';
import { productLookupKey, type ProductDictionary } from './product-identity.js';

import type { PurchaseProductAliasRow, PurchaseProductRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';
import type { ProductDictionaryEntry } from './product-identity.js';

/**
 * The whole dictionary, in the shape `identifyProduct` consults.
 *
 * Whole rather than filtered: a caller folding a scoped set of lines cannot
 * know which entries it will need without first computing every line's scope,
 * and the table is bounded by distinct printed wordings — hundreds, not the
 * hundreds of thousands a line-grained table would be.
 */
export function loadProductDictionary(db: PurchasesDb): ProductDictionary {
  const rows = db
    .select({
      scopeKey: purchaseProductAliases.scopeKey,
      normalisedName: purchaseProductAliases.normalisedName,
      productId: purchaseProductAliases.productId,
      confirmedAt: purchaseProductAliases.confirmedAt,
      label: purchaseProducts.label,
    })
    .from(purchaseProductAliases)
    .innerJoin(purchaseProducts, eq(purchaseProducts.id, purchaseProductAliases.productId))
    .all();

  const dictionary = new Map<string, ProductDictionaryEntry>();
  for (const row of rows) {
    dictionary.set(productLookupKey(row.scopeKey, row.normalisedName), {
      productId: row.productId,
      label: row.label,
      confirmed: row.confirmedAt !== null,
    });
  }
  return dictionary;
}

/** A product together with every wording that resolves to it. */
export interface ProductWithAliases {
  readonly product: PurchaseProductRow;
  readonly aliases: readonly PurchaseProductAliasRow[];
}

export interface ListProductsFilter {
  /** Only products holding at least one wording under this source. */
  readonly source?: string;
  /**
   * `true` keeps products a human has asserted at least one wording of;
   * `false` keeps the ones nobody has touched. Omitted keeps both.
   */
  readonly confirmed?: boolean;
}

/**
 * The dictionary as a human reads it: products, each with its wordings.
 *
 * No paging. The table is one row per distinct printed wording, and a
 * truncated dictionary is one whose missing half is silently identical to a
 * wording that has no entry — the two states a caller most needs to tell
 * apart.
 */
export function listProducts(
  db: PurchasesDb,
  filter: ListProductsFilter = {}
): readonly ProductWithAliases[] {
  const byProduct = new Map<string, PurchaseProductAliasRow[]>();
  for (const alias of db.select().from(purchaseProductAliases).all()) {
    const held = byProduct.get(alias.productId);
    if (held === undefined) byProduct.set(alias.productId, [alias]);
    else held.push(alias);
  }

  return db
    .select()
    .from(purchaseProducts)
    .all()
    .map((product) => ({
      product,
      aliases: (byProduct.get(product.id) ?? []).toSorted((a, b) =>
        a.normalisedName < b.normalisedName ? -1 : 1
      ),
    }))
    .filter(({ aliases }) => matchesFilter(aliases, filter))
    .toSorted(compareProducts);
}

function matchesFilter(
  aliases: readonly PurchaseProductAliasRow[],
  filter: ListProductsFilter
): boolean {
  const bySource =
    filter.source === undefined ? aliases : aliases.filter((a) => a.source === filter.source);
  if (bySource.length === 0) return false;
  if (filter.confirmed === undefined) return true;
  return bySource.some((alias) => (alias.confirmedAt !== null) === filter.confirmed);
}

/** Label ascending, id breaking ties, so equal data always serialises equally. */
function compareProducts(a: ProductWithAliases, b: ProductWithAliases): number {
  if (a.product.label !== b.product.label) return a.product.label < b.product.label ? -1 : 1;
  return a.product.id < b.product.id ? -1 : 1;
}
