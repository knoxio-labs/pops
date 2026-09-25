/**
 * `planPurchaseUpdate` — the read-only half of editing a saved purchase.
 *
 * Split from `purchase-edit.ts` to keep both files under the line-count
 * cap; there is no behavioural reason for the boundary to sit here rather
 * than anywhere else in that service.
 */
import { eq } from 'drizzle-orm';

import { inventoryItemIdFromUri } from '../../contract/inventory-proposals.js';
import { InvalidIngestPayloadError, PurchaseLockedError, PurchaseStaleError } from '../errors.js';
import { purchaseItems, purchaseItemUnits, purchases } from '../schema.js';
import { type PurchasesDb } from './internal.js';
import { computeExpectedTotalCents } from './purchase-write-validation.js';

import type { PurchaseItemRow, PurchaseRow } from '../schema.js';
import type { UpdatePurchaseInput, UpdatePurchaseLineInput } from './purchase-input.js';

/**
 * Statuses whose merchant, date and total stay editable. Everything else
 * locks (POPS-4255). `nothing_to_settle` joins this set for the same reason
 * `awaiting_settlement` is in it: nothing has matched this order to
 * anything yet, so correcting its total (say, a $0 cancellation that turns
 * out to have actually shipped) cannot invalidate a match (POPS-4648).
 */
const UNLOCKED_STATUSES: ReadonlySet<string> = new Set([
  'awaiting_settlement',
  'settled_cash',
  'ignored',
  'nothing_to_settle',
]);

export interface RemovedLine {
  readonly item: PurchaseItemRow;
  readonly inventoryItemIds: readonly string[];
}

export interface KeptLine {
  readonly existing: PurchaseItemRow;
  readonly next: UpdatePurchaseLineInput;
}

export interface UpdatePlan {
  readonly purchase: PurchaseRow;
  readonly existingItems: readonly PurchaseItemRow[];
  readonly removed: readonly RemovedLine[];
  readonly added: readonly UpdatePurchaseLineInput[];
  readonly kept: readonly KeptLine[];
}

function changesLockedFields(purchase: PurchaseRow, input: UpdatePurchaseInput): boolean {
  return (
    (input.merchantEntityId !== undefined &&
      input.merchantEntityId !== purchase.merchantEntityId) ||
    (input.merchantEntityName !== undefined &&
      input.merchantEntityName !== purchase.merchantEntityName) ||
    (input.orderedAt !== undefined && input.orderedAt !== purchase.orderedAt) ||
    (input.totalCents !== undefined && input.totalCents !== purchase.totalCents)
  );
}

function removedLinesOf(
  db: PurchasesDb,
  existingItems: readonly PurchaseItemRow[],
  keptIds: ReadonlySet<string>
): RemovedLine[] {
  return existingItems
    .filter((item) => !keptIds.has(item.id))
    .map((item) => {
      const units = db
        .select()
        .from(purchaseItemUnits)
        .where(eq(purchaseItemUnits.itemId, item.id))
        .all();
      const inventoryItemIds = units
        .map((unit) =>
          unit.inventoryItemUri === null ? null : inventoryItemIdFromUri(unit.inventoryItemUri)
        )
        .filter((id): id is string => id !== null);
      return { item, inventoryItemIds };
    });
}

interface SplitLines {
  readonly kept: readonly KeptLine[];
  readonly added: readonly UpdatePurchaseLineInput[];
  readonly keptIds: ReadonlySet<string>;
}

/**
 * Which lines an edit keeps (matched by id) versus adds (no id), and the
 * kept set's ids. Throws when a kept id names a line this purchase does
 * not have — a stale or foreign reference the caller could not have gotten
 * from this purchase's own detail read.
 */
function splitLines(
  purchaseId: string,
  lines: readonly UpdatePurchaseLineInput[],
  existingById: ReadonlyMap<string, PurchaseItemRow>
): SplitLines {
  const keptIds = new Set(
    lines.filter((line) => line.id !== undefined).map((line) => line.id as string)
  );
  for (const id of keptIds) {
    if (!existingById.has(id)) {
      throw new InvalidIngestPayloadError(`line '${id}' does not belong to purchase ${purchaseId}`);
    }
  }
  const kept = lines
    .filter((line) => line.id !== undefined)
    .map((line) => ({
      existing: existingById.get(line.id as string) as PurchaseItemRow,
      next: line,
    }));
  const added = lines.filter((line) => line.id === undefined);
  return { kept, added, keptIds };
}

/** Throws {@link InvalidIngestPayloadError} when the edited lines and adjustments no longer sum to the stated total. */
function assertTotalConsistent(
  purchase: PurchaseRow,
  input: UpdatePurchaseInput,
  lines: readonly UpdatePurchaseLineInput[]
): void {
  const lineTotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const expectedTotal = computeExpectedTotalCents(lineTotalCents, {
    discountCents: input.discountCents ?? purchase.discountCents,
    surchargeCents: input.surchargeCents ?? purchase.surchargeCents,
    shippingCents: input.shippingCents ?? purchase.shippingCents,
    taxCents: input.taxCents ?? purchase.taxCents,
    discountIncluded: purchase.discountIncluded,
    surchargeIncluded: purchase.surchargeIncluded,
    shippingIncluded: purchase.shippingIncluded,
    taxIncluded: purchase.taxIncluded,
  });
  const statedTotal = input.totalCents ?? purchase.totalCents;
  if (expectedTotal !== statedTotal) {
    throw new InvalidIngestPayloadError(
      `the lines and adjustments sum to ${String(expectedTotal)} cents, which does not match the stated total of ${String(statedTotal)} cents`
    );
  }
}

/**
 * Read-only planning pass: what this edit would do, and whether it is even
 * allowed — without writing anything.
 *
 * Returns `undefined` for an unknown purchase. Throws
 * {@link PurchaseStaleError}, {@link PurchaseLockedError} or
 * {@link InvalidIngestPayloadError} for a refused one.
 */
export function planPurchaseUpdate(
  db: PurchasesDb,
  purchaseId: string,
  input: UpdatePurchaseInput
): UpdatePlan | undefined {
  const purchase = db.select().from(purchases).where(eq(purchases.id, purchaseId)).all()[0];
  if (purchase === undefined) return undefined;

  if (input.expectedUpdatedAt !== purchase.updatedAt) {
    throw new PurchaseStaleError(purchaseId);
  }
  if (!UNLOCKED_STATUSES.has(purchase.status) && changesLockedFields(purchase, input)) {
    throw new PurchaseLockedError(purchaseId);
  }

  const existingItems = db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .all();
  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  const { kept, added, keptIds } = splitLines(purchaseId, input.lines, existingById);

  assertTotalConsistent(purchase, input, input.lines);

  return {
    purchase,
    existingItems,
    removed: removedLinesOf(db, existingItems, keptIds),
    added,
    kept,
  };
}

/** Every distinct inventory item id a plan's removed lines would unlink. Empty when none are linked. */
export function inventoryUnlinkTargets(plan: UpdatePlan): readonly string[] {
  return [...new Set(plan.removed.flatMap((removed) => removed.inventoryItemIds))];
}
