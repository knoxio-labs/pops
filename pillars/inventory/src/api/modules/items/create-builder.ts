import { crossPillarUrisService, type homeInventory } from '../../../db/index.js';

import type { NullableColumnKeys } from './nullable-column-keys.js';
import type { CreateInventoryItemInput } from './types.js';

type InventoryInsert = typeof homeInventory.$inferInsert;

/**
 * Keys passed straight through as string|null. An absent key is written as
 * `null` rather than left out, so create never falls back to a column default.
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
    values[key] = input[key] ?? null;
  }
}
