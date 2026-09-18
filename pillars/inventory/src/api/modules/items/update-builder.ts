import { assignNullableKeys } from '@pops/pillar-sdk/db';

import { crossPillarUrisService, type ItemInsert } from '../../../db/index.js';
import { assignRenamedColumns } from './renamed-columns.js';

import type { PlacementColumns } from './legacy-placement.js';
import type { NullableColumnKeys } from './nullable-column-keys.js';
import type { UpdateInventoryItemInput } from './types.js';

type InventoryUpdate = Partial<ItemInsert>;

/**
 * Keys where we pass through string|null, whose request name is also the
 * column's name.
 *
 * - `undefined` means "leave unchanged" (the key is not written to the update payload)
 * - `null` means "clear the field" (the key is written with a null value)
 */
const NULLABLE_STRING_KEYS = [
  'brand',
  'model',
  'itemId',
  'room',
  'condition',
  'purchaseDate',
  'warrantyExpires',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
] as const satisfies ReadonlyArray<NullableColumnKeys<UpdateInventoryItemInput, string>>;

const NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
  'purchasePrice',
] as const satisfies ReadonlyArray<NullableColumnKeys<UpdateInventoryItemInput, number>>;

/**
 * Build the partial update payload for an item from the legacy update request
 * and the placement it resolves to (`null` when placement is unchanged).
 * Returns `null` when nothing changes, so callers can skip the DB write.
 */
export function buildInventoryUpdate(
  input: UpdateInventoryItemInput,
  placement: PlacementColumns | null
): InventoryUpdate | null {
  const updates: InventoryUpdate = {};
  let touched = false;

  if (assignItemName(updates, input)) touched = true;
  if (assignNullableKeys(updates, input, NULLABLE_STRING_KEYS)) touched = true;
  if (assignNullableKeys(updates, input, NULLABLE_NUMBER_KEYS)) touched = true;
  if (assignRenamedColumns(updates, input)) touched = true;
  if (assignBooleanFlags(updates, input)) touched = true;
  if (placement !== null) {
    Object.assign(updates, placement);
    touched = true;
  }
  assignDerivedPurchaseTransactionUri(updates, input);

  if (!touched) return null;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}

/**
 * Keep the derived soft URI in lockstep with the id it is derived from, and
 * drop the staleness verdict along with it — that verdict was reached about
 * the previous target and says nothing about the new one.
 */
function assignDerivedPurchaseTransactionUri(
  updates: InventoryUpdate,
  input: UpdateInventoryItemInput
): void {
  if (input.purchaseTransactionId === undefined) return;
  updates.purchaseTransactionUri = crossPillarUrisService.purchaseTransactionUriFor(
    input.purchaseTransactionId
  );
  updates.purchaseTransactionStaleAt = null;
}

function assignItemName(updates: InventoryUpdate, input: UpdateInventoryItemInput): boolean {
  if (input.itemName === undefined) return false;
  updates.name = input.itemName;
  return true;
}

function assignBooleanFlags(updates: InventoryUpdate, input: UpdateInventoryItemInput): boolean {
  let touched = false;
  if (input.inUse !== undefined) {
    updates.inUse = input.inUse === null ? null : Number(input.inUse);
    touched = true;
  }
  if (input.deductible !== undefined) {
    updates.deductible = input.deductible ? 1 : 0;
    touched = true;
  }
  return touched;
}
