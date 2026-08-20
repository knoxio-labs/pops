/**
 * Recording what a human decided about an inventory proposal.
 *
 * The write half of the fan-out; `inventory-proposals.ts` is the read half,
 * and the reason they are two files is the same one that splits the cron's
 * worker from its legs — the file-size budget, not a boundary in the model.
 * The vocabulary they share, including what makes a unit *decided*, lives
 * next to the projection that consumes it.
 *
 * Nothing here creates the inventory row an accept names, and nothing here
 * checks that it exists: an accept records a URI its caller states. Both
 * routes above this one arrange to have that row already — one because the
 * caller made it, one because the handler did — because a reference
 * recorded before its row exists is one the nightly soft-URI cron would
 * find unresolvable and stamp stale, a fan-out reporting its own eagerness
 * as an outage.
 */
import { and, eq } from 'drizzle-orm';

import { InventoryProposalConflictError } from '../errors.js';
import { purchaseItems, purchaseItemUnits } from '../schema/items.js';
import { nowIso, type PurchasesDb } from './internal.js';
import { isUndecided } from './inventory-proposals.js';

import type { PurchaseItemUnitRow } from '../schema.js';

/** A human's answer to one proposal. */
export type InventoryProposalDecision =
  | {
      readonly decision: 'accepted';
      /** Where the asset now lives: `pops://inventory/item/<id>`. */
      readonly inventoryItemUri: string;
      readonly unitId?: string;
    }
  | { readonly decision: 'declined'; readonly unitId?: string };

/**
 * The existing unit an answer named, when the caller named one.
 *
 * A named unit that has already been answered is a conflict rather than an
 * overwrite: replaying an accept must not be able to relink a unit nobody
 * looked at, which is what a double submit would otherwise do.
 */
function findNamedUnit(
  db: PurchasesDb,
  itemId: string,
  unitId: string
): PurchaseItemUnitRow | undefined {
  const named = db
    .select()
    .from(purchaseItemUnits)
    .where(and(eq(purchaseItemUnits.itemId, itemId), eq(purchaseItemUnits.id, unitId)))
    .get();
  if (named === undefined) return undefined;
  if (!isUndecided(named)) {
    throw new InventoryProposalConflictError(
      `Unit ${unitId} has already been accepted or declined; purchases has no way to retract an inventory decision`
    );
  }
  return named;
}

/**
 * Record what a human decided about one of the line's proposals.
 *
 * Returns undefined when the line does not exist on that order, or when a
 * named unit does not exist on that line. The two-part key is the same
 * guard `confirmItemClassification` carries: ids are random UUIDs, so a
 * caller holding a line id but not its order is guessing, and answering
 * the guess would let a mistyped order id decide for someone else's line.
 *
 * An answer that names no `unitId` is an answer to a slot that has no unit
 * row, so it mints one; it never lands on an existing row. The projection
 * offers a slot with a row and a slot without as two separate proposals,
 * and the one without carries no identity a caller can send back — so
 * folding the unnamed answer onto the oldest undecided row would silently
 * record the decision against a different physical unit than the one the
 * human answered for, the one carrying a serial number among them.
 *
 * A line with a row for every unit it claims therefore has nothing left to
 * answer unnamed, and a decision that names nothing is a conflict rather
 * than a silent extra unit: that is what stops a double-submitted accept
 * putting two assets in inventory for one physical thing.
 */
export function decideInventoryProposal(
  db: PurchasesDb,
  purchaseId: string,
  itemId: string,
  input: InventoryProposalDecision
): PurchaseItemUnitRow | undefined {
  return db.transaction((tx) => {
    const line = tx
      .select({ id: purchaseItems.id, quantity: purchaseItems.quantity })
      .from(purchaseItems)
      .where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId)))
      .limit(1)
      .get();
    if (line === undefined) return undefined;

    const values =
      input.decision === 'accepted'
        ? { inventoryItemUri: input.inventoryItemUri, inventoryDeclinedAt: null }
        : { inventoryItemUri: null, inventoryDeclinedAt: nowIso() };

    if (input.unitId !== undefined) {
      const named = findNamedUnit(tx, itemId, input.unitId);
      if (named === undefined) return undefined;
      return tx
        .update(purchaseItemUnits)
        .set(values)
        .where(eq(purchaseItemUnits.id, named.id))
        .returning()
        .get();
    }

    const existing = tx
      .select()
      .from(purchaseItemUnits)
      .where(eq(purchaseItemUnits.itemId, itemId))
      .all();
    // The projection offers at least one slot however small the quantity,
    // so the write half counts slots the same way rather than refusing to
    // answer an offer it just made.
    if (existing.length >= Math.max(line.quantity, 1)) {
      throw new InventoryProposalConflictError(
        existing.some(isUndecided)
          ? `Item ${itemId} has no proposal left that is not held by a unit row; name the unitId of the unit being answered`
          : `Every unit of item ${itemId} has already been accepted or declined`
      );
    }
    return tx
      .insert(purchaseItemUnits)
      .values({ itemId, ...values })
      .returning()
      .get();
  });
}
