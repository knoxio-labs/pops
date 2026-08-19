/**
 * Recording what a human decided about an inventory proposal.
 *
 * The write half of the fan-out; `inventory-proposals.ts` is the read half,
 * and the reason they are two files is the same one that splits the cron's
 * worker from its legs — the file-size budget, not a boundary in the model.
 * The vocabulary they share, including what makes a unit *decided*, lives
 * next to the projection that consumes it.
 *
 * Purchases does not create the inventory row an accept names. That row is
 * the inventory pillar's to write, and a reference recorded before it
 * exists is one the nightly soft-URI cron would find unresolvable and stamp
 * stale — a fan-out reporting its own eagerness as an outage.
 */
import { and, asc, eq } from 'drizzle-orm';

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
 * The unit this answer lands on, or undefined when a fresh one is wanted.
 *
 * A named unit that has already been answered is a conflict rather than an
 * overwrite: replaying an accept must not be able to relink a unit nobody
 * looked at, which is what a double submit would otherwise do.
 */
function findUndecidedUnit(
  db: PurchasesDb,
  itemId: string,
  unitId: string | undefined
): PurchaseItemUnitRow | undefined {
  const rows = db
    .select()
    .from(purchaseItemUnits)
    .where(eq(purchaseItemUnits.itemId, itemId))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();
  if (unitId === undefined) return rows.find(isUndecided);
  const named = rows.find((row) => row.id === unitId);
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
 * With no `unitId` the decision lands on the line's oldest undecided unit
 * row, and mints one when there is none — which is how a slot that never
 * needed identity gets it. A line whose units are all decided has nothing
 * left to answer for, so a further decision is a conflict rather than a
 * silent extra unit: that is what stops a double-submitted accept putting
 * two assets in inventory for one physical thing.
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

    const target = findUndecidedUnit(tx, itemId, input.unitId);
    if (target === undefined && input.unitId !== undefined) return undefined;

    const values =
      input.decision === 'accepted'
        ? { inventoryItemUri: input.inventoryItemUri, inventoryDeclinedAt: null }
        : { inventoryItemUri: null, inventoryDeclinedAt: nowIso() };

    if (target !== undefined) {
      return tx
        .update(purchaseItemUnits)
        .set(values)
        .where(eq(purchaseItemUnits.id, target.id))
        .returning()
        .get();
    }

    const existing = tx
      .select({ id: purchaseItemUnits.id })
      .from(purchaseItemUnits)
      .where(eq(purchaseItemUnits.itemId, itemId))
      .all();
    if (existing.length >= line.quantity) {
      throw new InventoryProposalConflictError(
        `Every unit of item ${itemId} has already been accepted or declined`
      );
    }
    return tx
      .insert(purchaseItemUnits)
      .values({ itemId, ...values })
      .returning()
      .get();
  });
}
