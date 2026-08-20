/**
 * Editing the learned product dictionary — the human's half.
 *
 * **How a bad entry is undone.** Every write here is reversible and none of
 * them touches a line:
 *
 * - a wrong *merge* — repoint the wording back out with {@link updateAlias},
 *   passing `productId: null` to give it a product of its own again;
 * - a wrong *confirmation* — {@link updateAlias} with `confirmed: false`
 *   returns the entry to a proposal a pass may retire;
 * - a wrong *entry* — {@link deleteAlias} forgets the wording, and its lines
 *   fall back to the on-the-fly grouping they had before the pass ran;
 * - a wrong *product* — {@link deleteProduct} takes every wording with it;
 * - a wrong *name* — {@link renameProduct} again. What that does not undo is
 *   the fact that a human named it: the product stays out of the pass's
 *   reach, and {@link deleteProduct} is the way to be rid of it entirely.
 *
 * A product left with no wordings is deleted in the same write, because a
 * product nothing resolves to is a label no read path can ever reach — and one
 * a caller could still confirm and rename.
 */
import { eq, sql } from 'drizzle-orm';

import { ProductDictionaryNotFoundError } from '../errors.js';
import { purchaseProductAliases, purchaseProducts } from '../schema.js';
import { expectRow, nowIso } from './internal.js';

import type { PurchaseProductAliasRow, PurchaseProductRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/**
 * Remove products no wording resolves to.
 *
 * Shared with the proposal pass, which orphans products whenever it retires
 * the last wording that reached one.
 */
export function deleteOrphanedProducts(db: PurchasesDb): number {
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
 * Both halves in one call because the ordinary correction is both at once:
 * "that is the same thing as this, and I mean it".
 *
 * They stay separately statable, though, and a merge left unconfirmed is
 * exactly as durable as any other proposal — which is to say the pass may
 * retire it once no line prints that wording any more. Nothing here prevents
 * that state, and it is not a trap: while the wording is still printed the
 * merge holds, and once nothing prints it the entry reaches no line either
 * way. A caller that wants the merge to outlive the wording confirms it.
 */
export function updateAlias(
  db: PurchasesDb,
  aliasId: string,
  input: UpdateAliasInput
): PurchaseProductAliasRow {
  return db.transaction((tx) => {
    const alias = tx
      .select()
      .from(purchaseProductAliases)
      .where(eq(purchaseProductAliases.id, aliasId))
      .all()[0];
    if (alias === undefined) throw new ProductDictionaryNotFoundError('alias', aliasId);

    // One transaction: a split mints the product before the wording is moved
    // onto it, so a failure between the two would leave a label nothing
    // resolves to, and the orphan sweep that follows the move would already
    // have run.
    const productId = resolveTarget(tx, alias, input);
    const confirmedAt = resolveConfirmation(alias, input);

    const updated = expectRow(
      tx
        .update(purchaseProductAliases)
        .set({ productId, confirmedAt })
        .where(eq(purchaseProductAliases.id, aliasId))
        .returning()
        .all(),
      'updateAlias'
    );
    deleteOrphanedProducts(tx);
    return updated;
  });
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

/**
 * Rename a product, and record that a human is the one who named it.
 *
 * The wordings that resolve to it are untouched — a name is not a claim
 * about any of them, and confirming them here would turn an unconfirmed
 * merge into an asserted one behind the caller's back. What the rename does
 * put beyond the pass's reach is the product: `labelConfirmedAt` is what
 * stops {@link deleteOrphanedProducts} being handed a row whose name nothing
 * can reconstruct, once the wording that prompted the rename stops printing.
 *
 * The instant moves on every rename, unlike a re-stated confirmation on an
 * alias: a new name is a new assertion, where re-confirming the same wording
 * is the same one.
 */
export function renameProduct(
  db: PurchasesDb,
  productId: string,
  label: string
): PurchaseProductRow {
  const row = db
    .update(purchaseProducts)
    .set({ label, labelConfirmedAt: nowIso() })
    .where(eq(purchaseProducts.id, productId))
    .returning()
    .all()[0];
  if (row === undefined) throw new ProductDictionaryNotFoundError('product', productId);
  return row;
}

/** Forget one wording. Its lines fall back to the on-the-fly grouping. */
export function deleteAlias(db: PurchasesDb, aliasId: string): boolean {
  return db.transaction((tx) => {
    const removed =
      tx.delete(purchaseProductAliases).where(eq(purchaseProductAliases.id, aliasId)).run()
        .changes > 0;
    if (removed) deleteOrphanedProducts(tx);
    return removed;
  });
}

/** Forget a product and every wording that resolved to it. */
export function deleteProduct(db: PurchasesDb, productId: string): boolean {
  return db.delete(purchaseProducts).where(eq(purchaseProducts.id, productId)).run().changes > 0;
}
