import { assignNullableKeys } from '@pops/pillar-sdk/db';

import { crossPillarUrisService, type homeInventory } from '../../../db/index.js';

import type { NullableColumnKeys } from './nullable-column-keys.js';
import type { CreateInventoryItemInput } from './types.js';

type InventoryInsert = typeof homeInventory.$inferInsert;

/**
 * Keys passed straight through as string|null.
 *
 * - absent (`undefined`) means "let the column default apply" — the key is
 *   left out of the insert payload entirely; for a column with no
 *   `.default()` in the schema this still lands as `NULL`, so omitting is
 *   behaviourally identical to writing `null` for every key here except
 *   `condition`, the one column that declares a default.
 * - explicit `null` means "no value", written through as `NULL`.
 */
const CREATE_NULLABLE_STRING_KEYS = [
  'brand',
  'model',
  'itemId',
  'room',
  'location',
  'type',
  'condition',
  'purchaseDate',
  'warrantyExpires',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
  'assetId',
  'notes',
  'locationId',
  'containerId',
  'sourceRef',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateInventoryItemInput, string>>;

const CREATE_NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
  'purchasePrice',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateInventoryItemInput, number>>;

/** Build the insert payload for a new inventory item. */
export function buildCreateValues(
  id: string,
  now: string,
  input: CreateInventoryItemInput
): InventoryInsert {
  const values: InventoryInsert = {
    id,
    itemName: input.itemName,
    deductible: input.deductible ? 1 : 0,
    lastEditedTime: now,
    purchaseTransactionUri: crossPillarUrisService.purchaseTransactionUriFor(
      input.purchaseTransactionId
    ),
  };
  // input.inUse is left unset (→ NULL, "nobody has reviewed this row") unless
  // the caller sent an explicit true/false. The column has no default, so an
  // omitted key lands as NULL the same as writing it explicitly (POPS-2432).
  if (input.inUse !== undefined && input.inUse !== null) {
    values.inUse = input.inUse ? 1 : 0;
  }

  assignNullableKeys(values, input, CREATE_NULLABLE_STRING_KEYS);
  assignNullableKeys(values, input, CREATE_NULLABLE_NUMBER_KEYS);

  return values;
}
