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
 * - a wrong *product* — {@link deleteProduct} takes every wording with it.
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
  const row = db
    .update(purchaseProducts)
    .set({ label })
    .where(eq(purchaseProducts.id, productId))
    .returning()
    .all()[0];
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
