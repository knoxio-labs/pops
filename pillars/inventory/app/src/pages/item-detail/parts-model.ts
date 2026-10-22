import { inventoryApiErrorOf } from '../../inventory-api-helpers.js';

import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { ItemParts } from '../../inventory-api/index.js';

type Part = ItemParts['parts'][number];

/** The react-query key for an item's assembly and parts. */
export function partsQueryKey(itemId: string): readonly unknown[] {
  return ['inventory', 'parts', { itemId }];
}

/** Where a part is, in the words a row shows. */
export function partWhere(placement: Part['placement']): string {
  if (placement.kind === 'container') {
    return placement.containingItemName === null
      ? 'In a container'
      : `In ${placement.containingItemName}`;
  }
  if (placement.kind === 'location') return placement.locationName ?? 'At a location';
  return 'In hand';
}

/** The API error to toast, keeping the server's message (a 409 explains why). */
export function partError(error: Error, fallback: string): InventoryApiError {
  return inventoryApiErrorOf(error, fallback);
}

/** Why the remove and add verbs are unavailable, if they are. */
export function partsDisabledReasons(view: ItemParts, readOnly: boolean, busy: boolean) {
  const busyReason = busy ? 'Updating parts.' : undefined;
  const disabledReason = readOnly ? 'Nothing can change on this item.' : busyReason;
  const addDisabledReason =
    disabledReason ?? (view.canHaveParts ? undefined : 'This type does not grant parts.');
  return { disabledReason, addDisabledReason };
}
