/**
 * `purchase_products` and `purchase_product_aliases` — the learned dictionary
 * that gives a printed line a durable product identity.
 *
 * Two of the three shipped adapters state no product identifier at all: a
 * Woolworths receipt row is `{prefixChar, description, amount}` and a
 * photographed receipt states less, by design. For those lines the only
 * evidence of identity is the text a till printed, so the grouping every
 * aggregate does today (`db/services/product-identity.ts`) is a *proposal*
 * computed on the fly and forgotten. Nothing durable exists to correct.
 *
 * These two tables are that durable thing. A **product** is a name a human
 * would recognise. An **alias** is one printed wording, in one scope, that
 * resolves to it — the dictionary entry. `CHK BRST 1KG` on a till receipt
 * and `Chicken Breast 1kg` on an invoice become one product by pointing two
 * aliases at it, and every later line printing either wording resolves
 * without anyone being asked again.
 *
 * **Not `purchase_items.sku`.** That column means "what the source stated"
 * and its scheme vocabulary is closed; a value POPS derived would be
 * indistinguishable from a merchant's word, which is the confusion
 * `merchant_category` was cleaned up for.
 *
 * **The dictionary is never consulted for a line that states a sku.** An
 * ASIN already groups Amazon's repeats exactly, and a minted identity
 * merging into an ASIN-keyed group would be a guess absorbing an assertion.
 */
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * One product: the thing a human recognises, independent of how any till
 * spelled it.
 *
 * Carries no source, no merchant and no sku, because a product is precisely
 * the identity that survives those changing. What ties it to the data is its
 * aliases, and a product with none is unreachable — the write path deletes
 * such a row rather than leaving a label nothing can ever resolve to.
 */
export const purchaseProducts = sqliteTable('purchase_products', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /**
   * What to call it. Seeded from the printed wording that first minted the
   * product and changed only by a human, so a proposal wears the till's
   * abbreviation until somebody types the real name.
   */
  label: text('label').notNull(),
  /**
   * When a human named it, and NULL while the label is still the till's.
   *
   * The alias marker cannot stand in for this one. `confirmedAt` says *this
   * wording is that product*, which is a claim about the wording; typing a
   * name is a claim about the product, and the two are made separately. A
   * product carrying this marker is out of the proposal pass's reach the same
   * way a confirmed wording is: the pass does not retire the wordings that
   * reach it, so the name outlives the printing that prompted it.
   */
  labelConfirmedAt: text('label_confirmed_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

/**
 * One printed wording that resolves to a product — the dictionary entry.
 *
 * **The lookup is exact on the normalised name, and only that.** No prefix,
 * no substring, no edit distance. A product name's discriminating tokens sit
 * at its end — `MILK 1L` against `MILK 2L`, `Chicken Breast 1kg` against
 * `Chicken Breast 500g` — so a `startsWith` or `includes` rule merges two
 * genuinely different products and nothing downstream can see that it did.
 * Finance's `entity-matcher.ts` can afford those stages because a bank
 * descriptor's noise is its *suffix*; inverting that assumption here trades
 * a visible non-answer for an invisible wrong one.
 *
 * **`(scope_key, normalised_name)` is unique**, so a printed wording never
 * resolves two ways. That is the invariant every consumer leans on: a line
 * has at most one product, without a tie-break rule anybody has to agree on.
 */
export const purchaseProductAliases = sqliteTable(
  'purchase_product_aliases',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => purchaseProducts.id, { onDelete: 'cascade' }),
    /**
     * How far this wording's claim reaches, from `productScopeKey` — the same
     * function every aggregate keys its on-the-fly groups with, so an alias
     * matches exactly the lines that grouping would have put together. A
     * source that is one merchant's own feed scopes to the source, which is
     * what lets a chain's stores share a wording; any other source scopes to
     * the order's merchant, so two cafes printing `LATTE` are two entries.
     */
    scopeKey: text('scope_key').notNull(),
    /**
     * The source component of {@link scopeKey}, stored beside it so the
     * dictionary can be listed and filtered per source without decoding an
     * opaque key.
     */
    source: text('source').notNull(),
    /** The lookup key: `normalisedName(printedName)`. */
    normalisedName: text('normalised_name').notNull(),
    /** A sample of how it was actually printed, for a human reading the entry. */
    printedName: text('printed_name').notNull(),
    /**
     * When this entry stopped being a proposal.
     *
     * NULL means a pass observed the wording and minted an entry for it; a
     * later pass may retire it if no line prints it any more. Non-null means
     * a human asserted it — this wording *is* that product — and no pass may
     * retire, repoint or relabel it. The same idiom `purchase_item_tags` and
     * `purchase_items.kind_confirmed_at` carry, deliberately, rather than a
     * third way of saying the same thing.
     *
     * It sits on the alias rather than on the product because merging is
     * per-wording: confirming that `CHK BRST 1KG` is chicken breast says
     * nothing about whether `CHK BRST` is, and a single marker on the product
     * would silently promote the second the moment the first was confirmed.
     */
    confirmedAt: text('confirmed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    unique('uq_purchase_product_aliases_lookup').on(t.scopeKey, t.normalisedName),
    // Reading a product's wordings, and finding the aliases orphaned by a
    // repoint so the emptied product can be removed in the same write.
    index('idx_purchase_product_aliases_product').on(t.productId),
    index('idx_purchase_product_aliases_source').on(t.source),
  ]
);
