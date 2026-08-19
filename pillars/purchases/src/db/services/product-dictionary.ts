/**
 * Reading and editing the learned product dictionary.
 *
 * **What it learns from.** Two things, and deliberately nothing else:
 *
 * 1. *Repetition.* A printed wording that appears on a line is minted as an
 *    entry pointing at a product of its own. That is not a guess — it is the
 *    grouping every aggregate already does, written down so it can be
 *    pointed at.
 * 2. *Assertion.* A human repoints one entry at another entry's product, and
 *    from then on both wordings resolve to it, for every line already stored
 *    and every line that arrives later. That is the mapping being learned,
 *    and it is learned once.
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
 * **How a bad entry is undone.** Every write here is reversible and none of
 * them touches a line:
 *
 * - a wrong *merge* — repoint the alias back out with {@link updateAlias},
 *   passing `productId: null` to give it a product of its own again;
 * - a wrong *confirmation* — {@link updateAlias} with `confirmed: false`
 *   returns the entry to a proposal a pass may retire;
 * - a wrong *entry* — {@link deleteAlias} forgets the wording, and its lines
 *   fall back to the on-the-fly grouping they had before the pass ran;
 * - a wrong *product* — {@link deleteProduct} takes every wording with it.
 *
 * A product left with no aliases is deleted in the same write, because a
 * product nothing resolves to is a label no read path can ever reach.
 */
import { eq, inArray, sql } from 'drizzle-orm';

import { purchaseProductAliases, purchaseProducts, purchaseItems, purchases } from '../schema.js';
import { expectRow, nowIso, type PurchasesDb } from './internal.js';
import {
  normalisedName,
  productLookupKey,
  productScopeKey,
  type ProductDictionary,
  type ProductDictionaryEntry,
} from './product-identity.js';

import type { PurchaseProductAliasRow, PurchaseProductRow } from '../schema.js';

/** Raised when an alias or product id names no row. */
export class ProductDictionaryNotFoundError extends Error {
  readonly ref: string;

  constructor(kind: 'product' | 'alias', ref: string) {
    super(kind === 'product' ? `Product '${ref}' not found` : `Product alias '${ref}' not found`);
    this.name = 'ProductDictionaryNotFoundError';
    this.ref = ref;
  }
}

/**
 * The whole dictionary, in the shape {@link identifyProduct} consults.
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
  const aliases = db.select().from(purchaseProductAliases).all();
  const byProduct = new Map<string, PurchaseProductAliasRow[]>();
  for (const alias of aliases) {
    const held = byProduct.get(alias.productId);
    if (held === undefined) byProduct.set(alias.productId, [alias]);
    else held.push(alias);
  }

  const products = db.select().from(purchaseProducts).all();
  return products
    .map((product) => ({
      product,
      aliases: (byProduct.get(product.id) ?? []).toSorted((a, b) =>
        a.normalisedName < b.normalisedName ? -1 : 1
      ),
    }))
    .filter(({ aliases: held }) => matchesFilter(held, filter))
    .toSorted(compareProducts);
}

function matchesFilter(
  aliases: readonly PurchaseProductAliasRow[],
  filter: ListProductsFilter
): boolean {
  const bySource =
    filter.source === undefined
      ? aliases
      : aliases.filter((alias) => alias.source === filter.source);
  if (bySource.length === 0) return false;
  if (filter.confirmed === undefined) return true;
  return bySource.some((alias) => (alias.confirmedAt !== null) === filter.confirmed);
}

/** Label ascending, id breaking ties, so equal data always serialises equally. */
function compareProducts(a: ProductWithAliases, b: ProductWithAliases): number {
  if (a.product.label !== b.product.label) return a.product.label < b.product.label ? -1 : 1;
  return a.product.id < b.product.id ? -1 : 1;
}

/** What one run of the proposal pass changed. */
export interface ProposalOutcome {
  /** Lines read. Every line, including the sku-keyed ones the pass skips. */
  readonly scannedLines: number;
  /** Distinct scoped wordings the lines print, which is the pass's whole input. */
  readonly observedWordings: number;
  /** Entries minted for a wording that had none. */
  readonly proposed: number;
  /** Unconfirmed entries retired because no line prints that wording any more. */
  readonly retired: number;
  /** Entries left alone because a human asserted them. */
  readonly confirmed: number;
}

interface ObservedWording {
  readonly scopeKey: string;
  readonly source: string;
  readonly normalised: string;
  /** The newest line's printing of it, which is what a fresh entry is labelled with. */
  printedName: string;
  rank: string;
}

/**
 * Mint entries for the wordings the stored lines print, and retire the
 * unconfirmed entries nothing prints any more.
 *
 * **Over every line, with no filter, on purpose.** Deriving the dictionary
 * from a window would retire entries whose lines merely fell outside it — the
 * partial-answer trap, and here it destroys data rather than understating it.
 * The cost is one scan of `purchase_items` joined to its order, which is the
 * same scan the product leaderboard already makes.
 *
 * **A confirmed entry is untouchable.** It is not retired when its wording
 * stops appearing (a human's assertion outlives the line that prompted it, and
 * that line may only have been deleted and re-ingested), it is not repointed,
 * and it is not relabelled. That is the whole content of the `confirmedAt`
 * marker: null means this pass owns the row, non-null means it does not.
 *
 * Idempotent — running it twice over unchanged lines changes nothing.
 */
export function proposeProducts(db: PurchasesDb): ProposalOutcome {
  const lines = db
    .select({
      id: purchaseItems.id,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
      source: purchases.source,
      orderedAt: purchases.orderedAt,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .all();

  const observed = observeWordings(lines);
  const existing = db.select().from(purchaseProductAliases).all();

  const retired = retireUnobserved(db, existing, observed);
  const held = new Set(
    existing
      .filter((alias) => !retired.has(alias.id))
      .map((alias) => productLookupKey(alias.scopeKey, alias.normalisedName))
  );

  let proposed = 0;
  for (const [key, wording] of observed) {
    if (held.has(key)) continue;
    mintProposal(db, wording);
    proposed += 1;
  }

  return {
    scannedLines: lines.length,
    observedWordings: observed.size,
    proposed,
    retired: retired.size,
    confirmed: existing.filter((alias) => alias.confirmedAt !== null).length,
  };
}

interface ScannedLine {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly source: string;
  readonly orderedAt: string;
  readonly merchantEntityId: string | null;
  readonly merchantEntityName: string | null;
}

/**
 * The scoped wordings the lines print, each remembering the newest line's
 * spelling of it — so a fresh entry is labelled with the most recent
 * printing rather than with whichever row the query happened to return
 * first, which would make the label depend on read order.
 *
 * A line that states a sku is skipped entirely: the dictionary is never
 * consulted for one, so an entry minted from it could never be reached.
 */
function observeWordings(lines: readonly ScannedLine[]): Map<string, ObservedWording> {
  const observed = new Map<string, ObservedWording>();
  for (const line of lines) {
    if ((line.sku?.trim() ?? '') !== '') continue;
    const normalised = normalisedName(line.name);
    if (normalised === '') continue;

    const scopeKey = productScopeKey(line);
    const key = productLookupKey(scopeKey, normalised);
    const rank = `${line.orderedAt} ${line.id}`;
    const held = observed.get(key);
    if (held === undefined) {
      observed.set(key, {
        scopeKey,
        source: line.source,
        normalised,
        printedName: line.name,
        rank,
      });
    } else if (rank > held.rank) {
      held.printedName = line.name;
      held.rank = rank;
    }
  }
  return observed;
}

/** The unconfirmed entries no line prints any more, deleted. Returns their ids. */
function retireUnobserved(
  db: PurchasesDb,
  existing: readonly PurchaseProductAliasRow[],
  observed: ReadonlyMap<string, ObservedWording>
): ReadonlySet<string> {
  const stale = existing.filter(
    (alias) =>
      alias.confirmedAt === null &&
      !observed.has(productLookupKey(alias.scopeKey, alias.normalisedName))
  );
  if (stale.length === 0) return new Set();

  db.delete(purchaseProductAliases)
    .where(
      inArray(
        purchaseProductAliases.id,
        stale.map((alias) => alias.id)
      )
    )
    .run();
  deleteOrphanedProducts(db);
  return new Set(stale.map((alias) => alias.id));
}

function mintProposal(db: PurchasesDb, wording: ObservedWording): void {
  const product = expectRow(
    db.insert(purchaseProducts).values({ label: wording.printedName }).returning().all(),
    'mintProposal'
  );
  db.insert(purchaseProductAliases)
    .values({
      productId: product.id,
      scopeKey: wording.scopeKey,
      source: wording.source,
      normalisedName: wording.normalised,
      printedName: wording.printedName,
      confirmedAt: null,
    })
    .run();
}

/**
 * Remove products no wording resolves to.
 *
 * A repoint, a delete or a retirement can leave one behind, and it is not a
 * harmless leftover: it is a row that appears in the dictionary listing, can
 * be confirmed and renamed, and can never group a single line.
 */
function deleteOrphanedProducts(db: PurchasesDb): number {
  return db
    .delete(purchaseProducts)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${purchaseProductAliases}
                      WHERE ${purchaseProductAliases.productId} = ${purchaseProducts.id})`
    )
    .run().changes;
}

export interface UpdateAliasInput {
  /**
   * Where the wording should point.
   *
   * Absent leaves it where it is. A product id moves it there, which is the
   * merge: two wordings on one product is one product printed two ways.
   * `null` gives it a product of its own, minted from its own printed name —
   * the split, and the undo for a merge that was wrong.
   */
  readonly productId?: string | null;
  /**
   * `true` asserts the wording is that product and puts the entry beyond the
   * proposal pass's reach; `false` retracts that and returns it to a
   * proposal. Absent leaves the marker alone, so a merge and a confirmation
   * are separate decisions a caller can make separately.
   */
  readonly confirmed?: boolean;
}

/**
 * Repoint and/or confirm one wording.
 *
 * Both halves in one call because the ordinary correction is both at once —
 * "that is the same thing as this, and I mean it" — and splitting them across
 * two requests leaves a merge sitting unconfirmed in between, where the next
 * proposal pass would be entitled to retire it.
 */
export function updateAlias(
  db: PurchasesDb,
  aliasId: string,
  input: UpdateAliasInput
): PurchaseProductAliasRow {
  const alias = db
    .select()
    .from(purchaseProductAliases)
    .where(eq(purchaseProductAliases.id, aliasId))
    .all()[0];
  if (alias === undefined) throw new ProductDictionaryNotFoundError('alias', aliasId);

  const productId = resolveTarget(db, alias, input);
  const confirmedAt = resolveConfirmation(alias, input);

  const updated = expectRow(
    db
      .update(purchaseProductAliases)
      .set({ productId, confirmedAt })
      .where(eq(purchaseProductAliases.id, aliasId))
      .returning()
      .all(),
    'updateAlias'
  );
  deleteOrphanedProducts(db);
  return updated;
}

function resolveTarget(
  db: PurchasesDb,
  alias: PurchaseProductAliasRow,
  input: UpdateAliasInput
): string {
  if (input.productId === undefined) return alias.productId;
  if (input.productId === null) {
    return expectRow(
      db.insert(purchaseProducts).values({ label: alias.printedName }).returning().all(),
      'updateAlias'
    ).id;
  }
  const target = db
    .select()
    .from(purchaseProducts)
    .where(eq(purchaseProducts.id, input.productId))
    .all()[0];
  if (target === undefined) throw new ProductDictionaryNotFoundError('product', input.productId);
  return target.id;
}

function resolveConfirmation(
  alias: PurchaseProductAliasRow,
  input: UpdateAliasInput
): string | null {
  if (input.confirmed === undefined) return alias.confirmedAt;
  if (!input.confirmed) return null;
  // Re-confirming keeps the original instant: the assertion did not change,
  // and moving the timestamp would misreport when it was made.
  return alias.confirmedAt ?? nowIso();
}

/** Rename a product. The wordings that resolve to it are untouched. */
export function renameProduct(
  db: PurchasesDb,
  productId: string,
  label: string
): PurchaseProductRow {
  const rows = db
    .update(purchaseProducts)
    .set({ label })
    .where(eq(purchaseProducts.id, productId))
    .returning()
    .all();
  const row = rows[0];
  if (row === undefined) throw new ProductDictionaryNotFoundError('product', productId);
  return row;
}

/** Forget one wording. Its lines fall back to the on-the-fly grouping. */
export function deleteAlias(db: PurchasesDb, aliasId: string): boolean {
  const removed =
    db.delete(purchaseProductAliases).where(eq(purchaseProductAliases.id, aliasId)).run().changes >
    0;
  if (removed) deleteOrphanedProducts(db);
  return removed;
}

/** Forget a product and every wording that resolved to it. */
export function deleteProduct(db: PurchasesDb, productId: string): boolean {
  return db.delete(purchaseProducts).where(eq(purchaseProducts.id, productId)).run().changes > 0;
}
