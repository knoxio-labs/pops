/**
 * Deciding which lines are the same product.
 *
 * Two callers need this and they must not disagree: the classification pass
 * batches lines so one product is one decision, and the product-grain
 * aggregate groups lines so one product is one row. Two implementations
 * would mean a leaderboard whose groups are not the groups the pass reasoned
 * about.
 *
 * **Keying on `(source, sku)` alone is wrong, and wrong exactly where it
 * costs the most.** `sku` is written at one site in the tree — the Amazon
 * order-history mapper. Woolworths states no identifier and a photographed
 * receipt states less, so every non-Amazon line has `sku IS NULL`; SQL
 * `GROUP BY` folds NULLs into one group, which would collapse ~490 grocery
 * lines into a single product.
 *
 * So the key falls back through what the source actually states: the sku,
 * then the normalised product name, then the line's own id. The last is a
 * key that groups nothing, which is the correct answer for a line that
 * states nothing to group on.
 *
 * **A printed name is only comparable against the till that printed it.**
 * The source is not that till: `receipt` is one source id for every shop a
 * user photographs, so keying on the source alone would fold two cafes'
 * `LATTE` lines into one product with one summed cost and one shop's
 * wording as the label. The key is therefore confined to the merchant
 * unless {@link sourceNamesOneMerchant} says the source is one merchant's
 * own feed — which is what lets a Woolworths product still group across the
 * chain's stores instead of splitting per branch.
 *
 * **What this is not.** Only the `sku` basis is an identity a merchant
 * asserted. A name-keyed group is a *proposal* — two products whose printed
 * names normalise alike are merged, and one product a merchant prints two
 * ways stays split. Which basis a group was formed on therefore travels with
 * the group rather than being flattened away, because a consumer that cannot
 * tell them apart is a consumer presenting a guess as a fact.
 *
 * **The dictionary is the durable form of that proposal.** Pass one and a
 * line whose scoped normalised name has an entry resolves to the product it
 * names instead — which is how one product printed two ways stops being two
 * groups. The entry says whether a human asserted it, so a `product` group is
 * no more trusted than the evidence behind it. Two rules make the dictionary
 * safe to consult:
 *
 * - **It is never consulted for a line that states a sku.** An ASIN already
 *   groups Amazon's repeats exactly, and a wording a human attached must not
 *   be able to absorb an identity a merchant asserted.
 * - **Its entries are scoped by {@link productScopeKey}**, the same scope the
 *   on-the-fly grouping uses, so an entry reaches exactly the lines that
 *   grouping would have put together and no further.
 */
import { sourceNamesOneMerchant } from '../../ingest/source-ids.js';
import { identifyMerchant } from './merchant-identity.js';
import { tupleKey } from './tuple-key.js';

import type { SkuScheme } from '../../contract/constants.js';

/** What identifying a line needs to know about it. */
export interface ProductLine {
  readonly id: string;
  readonly source: string;
  readonly sku: string | null;
  /**
   * The namespace {@link sku} lives in. Not part of the key — the key is
   * already confined to one merchant, which is narrower than any scheme —
   * but carried so a consumer showing the identifier can say what kind of
   * string it is rather than printing a bare one.
   */
  readonly skuScheme: SkuScheme | null;
  readonly name: string;
  /** Its order's merchant, which the key is confined to unless the source names one. */
  readonly merchantEntityId: string | null;
  readonly merchantEntityName: string | null;
}

/**
 * Which lines a group holds together, and on what evidence.
 *
 * `source` is on every variant because the same string means different
 * things at different merchants: an Amazon ASIN and a Woolworths article
 * number that happen to match are not one product. The source is not on its
 * own the scope of a group, though — under a source that covers many
 * merchants the key is confined to one of them, so on every basis but
 * `product` the merchants a group lists are the merchants it could ever have
 * held. A `product` group is the exception, because pointing two scoped
 * wordings at one product is exactly the crossing a human is allowed to make.
 */
export type ProductIdentity =
  | {
      /** The merchant's own identifier. The only basis a source asserts. */
      readonly basis: 'sku';
      readonly source: string;
      readonly sku: string;
      /** A label from one of the lines, for display. The sku is the identity. */
      readonly name: string;
    }
  | {
      /** Printed names that normalise alike. A proposal, not an assertion. */
      readonly basis: 'name';
      readonly source: string;
      readonly sku: null;
      /** A label from one of the lines, as the merchant printed it. */
      readonly name: string;
      /** The grouping key itself, so never absent. */
      readonly normalisedName: string;
    }
  | {
      /**
       * A dictionary entry claimed this printed wording. The group is every
       * line whose wording resolves to the same product, which is more than
       * one wording exactly where a human said so.
       */
      readonly basis: 'product';
      /**
       * The source of the line this identity describes. Not a bound on the
       * group: a product a human merged across merchants holds lines from
       * several, and an aggregate folding them says so in its own merchant
       * list rather than here.
       */
      readonly source: string;
      readonly sku: null;
      /** As the merchant printed it, for display beside the product's own name. */
      readonly name: string;
      /** The product this wording resolves to — the grouping key. */
      readonly productId: string;
      /** The product's own name, which a human may have written. */
      readonly label: string;
      /**
       * Whether a human asserted this wording is that product. False means a
       * pass proposed it, which is exactly as strong a claim as a `name`
       * group — one wording, one product, nothing merged.
       *
       * Per line, so an aggregate folding a group of lines into one row must
       * fold this too: a group is asserted only where every wording in it
       * was, because one unasserted wording is lines the group holds on a
       * pass's proposal.
       */
      readonly confirmed: boolean;
    }
  | {
      /** No sku and no readable name: this group holds exactly one line. */
      readonly basis: 'unidentified';
      readonly source: string;
      readonly sku: null;
      readonly name: string;
      /** The grouping key itself — the line's own id. */
      readonly itemId: string;
    };

/** One dictionary entry: what a printed wording resolves to. */
export interface ProductDictionaryEntry {
  readonly productId: string;
  readonly label: string;
  /** False where a pass proposed the entry and a later pass may retire it. */
  readonly confirmed: boolean;
}

/**
 * The dictionary, keyed by {@link productLookupKey}.
 *
 * A map rather than a query per line: every caller folds thousands of lines
 * in one pass, and the whole dictionary is a few hundred rows.
 */
export type ProductDictionary = ReadonlyMap<string, ProductDictionaryEntry>;

/** The key a dictionary entry is stored and looked up under. */
export function productLookupKey(scopeKey: string, normalised: string): string {
  return tupleKey(scopeKey, normalised);
}

/**
 * Product name reduced to what identifies the product.
 *
 * Case and punctuation vary between receipts of the same item;
 * `WW Smky Chip Chdr TstyShrd Cheese 250g` is the same product however the
 * till chose to space it. Digits are kept — `1L` and `2L` are different
 * products, and dropping them would merge them.
 */
export function normalisedName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/**
 * How far a key reaches: the source, narrowed to one merchant where the
 * source is not itself one merchant's feed.
 *
 * Narrowing costs a split that is visible — two rows naming two shops —
 * where not narrowing costs a merge that is not: one row, one summed cost,
 * and nothing in it saying two shops were added together.
 */
export function productScopeKey(line: ProductLine): string {
  if (sourceNamesOneMerchant(line.source)) return tupleKey(line.source);
  const merchant = identifyMerchant(line.merchantEntityId, line.merchantEntityName);
  return tupleKey(line.source, merchant.key);
}

/**
 * The group a line belongs to, and the evidence that put it there.
 *
 * With no dictionary this is the on-the-fly grouping and nothing else, which
 * is what a database that has never run the proposal pass gets.
 */
export function identifyProduct(
  line: ProductLine,
  dictionary?: ProductDictionary
): { key: string; identity: ProductIdentity } {
  const scope = productScopeKey(line);
  const sku = line.sku?.trim() ?? '';
  if (sku !== '') {
    return {
      key: tupleKey(scope, 'sku', sku),
      identity: { basis: 'sku', source: line.source, sku, name: line.name },
    };
  }

  const normalised = normalisedName(line.name);
  if (normalised !== '') {
    const entry = dictionary?.get(productLookupKey(scope, normalised));
    if (entry !== undefined) {
      // Keyed on the product alone, not the scope, because merging two
      // merchants' wordings is the one thing this table exists to allow —
      // and it only ever happens because a human pointed both at one row.
      return {
        key: tupleKey('product', entry.productId),
        identity: {
          basis: 'product',
          source: line.source,
          sku: null,
          name: line.name,
          productId: entry.productId,
          label: entry.label,
          confirmed: entry.confirmed,
        },
      };
    }
    return {
      key: tupleKey(scope, 'name', normalised),
      identity: {
        basis: 'name',
        source: line.source,
        sku: null,
        name: line.name,
        normalisedName: normalised,
      },
    };
  }

  // A line with no identifier and no readable name. Keying on its own id
  // groups it with nothing, which is the only honest answer — the
  // alternative is a bucket every nameless line falls into and is counted
  // as one product in.
  return {
    key: tupleKey(scope, 'unidentified', line.id),
    identity: {
      basis: 'unidentified',
      source: line.source,
      sku: null,
      name: line.name,
      itemId: line.id,
    },
  };
}
