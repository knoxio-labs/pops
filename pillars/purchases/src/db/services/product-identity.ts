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
 * **What this is not.** Only the `sku` basis is an identity a merchant
 * asserted. A name-keyed group is a *proposal* — two products whose printed
 * names normalise alike are merged, and one product a merchant prints two
 * ways stays split. Which basis a group was formed on therefore travels with
 * the group rather than being flattened away, because a consumer that cannot
 * tell them apart is a consumer presenting a guess as a fact. Minting a
 * durable, confirmable product identity for the sources that state none is
 * a separate, unbuilt thing.
 */
import { tupleKey } from './tuple-key.js';

/** What identifying a line needs to know about it. */
export interface ProductLine {
  readonly id: string;
  readonly source: string;
  readonly sku: string | null;
  readonly name: string;
}

/**
 * Which lines a group holds together, and on what evidence.
 *
 * `source` is on every variant because the same string means different
 * things at different merchants: an Amazon ASIN and a Woolworths article
 * number that happen to match are not one product, and a receipt
 * abbreviation is only interpretable against the till that printed it.
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
      /** No sku and no readable name: this group holds exactly one line. */
      readonly basis: 'unidentified';
      readonly source: string;
      readonly sku: null;
      readonly name: string;
      /** The grouping key itself — the line's own id. */
      readonly itemId: string;
    };

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

/** The group a line belongs to, and the evidence that put it there. */
export function identifyProduct(line: ProductLine): { key: string; identity: ProductIdentity } {
  const sku = line.sku?.trim() ?? '';
  if (sku !== '') {
    return {
      key: tupleKey(line.source, 'sku', sku),
      identity: { basis: 'sku', source: line.source, sku, name: line.name },
    };
  }

  const normalised = normalisedName(line.name);
  if (normalised !== '') {
    return {
      key: tupleKey(line.source, 'name', normalised),
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
    key: tupleKey(line.source, 'unidentified', line.id),
    identity: {
      basis: 'unidentified',
      source: line.source,
      sku: null,
      name: line.name,
      itemId: line.id,
    },
  };
}
