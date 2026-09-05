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
    inUse: input.inUse ? 1 : 0,
    deductible: input.deductible ? 1 : 0,
    lastEditedTime: now,
    purchaseTransactionUri: crossPillarUrisService.purchaseTransactionUriFor(
      input.purchaseTransactionId
    ),
  };

  setNullableKeys(values, input, CREATE_NULLABLE_STRING_KEYS);
  setNullableKeys(values, input, CREATE_NULLABLE_NUMBER_KEYS);

  return values;
}

function setNullableKeys<K extends string, V extends string | number>(
  values: Partial<Record<K, V | null>>,
  input: Readonly<Partial<Record<K, V | null>>>,
  keys: readonly K[]
): void {
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    values[key] = value;
  }
}
