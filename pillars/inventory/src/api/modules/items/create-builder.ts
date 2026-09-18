import { assignNullableKeys } from '@pops/pillar-sdk/db';

import { crossPillarUrisService, type ItemInsert } from '../../../db/index.js';
import { assignRenamedColumns } from './renamed-columns.js';

import type { PlacementColumns } from './legacy-placement.js';
import type { NullableColumnKeys } from './nullable-column-keys.js';
import type { CreateInventoryItemInput } from './types.js';

/**
 * Keys passed straight through as string|null, whose request name is also
 * the column's name.
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
  'condition',
  'purchaseDate',
  'warrantyExpires',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
  'sourceRef',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateInventoryItemInput, string>>;

const CREATE_NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
  'purchasePrice',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateInventoryItemInput, number>>;

/**
 * Build the insert payload for a new item from the legacy create request.
 * `seq` is 0 because the legacy path writes no event; the command layer
 * (slice A7) replaces this writer.
 */
export function buildCreateValues(
  id: string,
  now: string,
  input: CreateInventoryItemInput,
  placement: PlacementColumns
): ItemInsert {
  const values: ItemInsert = {
    id,
    name: input.itemName,
    deductible: input.deductible ? 1 : 0,
    lastEditedTime: now,
    purchaseTransactionUri: crossPillarUrisService.purchaseTransactionUriFor(
      input.purchaseTransactionId
    ),
    seq: 0,
    ...placement,
  };
  // input.inUse is left unset (→ NULL, "nobody has reviewed this row") unless
  // the caller sent an explicit true/false. The column has no default, so an
  // omitted key lands as NULL the same as writing it explicitly (POPS-2432).
  if (input.inUse !== undefined && input.inUse !== null) {
    values.inUse = input.inUse ? 1 : 0;
  }

  assignNullableKeys(values, input, CREATE_NULLABLE_STRING_KEYS);
  assignNullableKeys(values, input, CREATE_NULLABLE_NUMBER_KEYS);
  assignRenamedColumns(values, input);

  return values;
}
