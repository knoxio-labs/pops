/**
 * Fixtures for the item form screen: the taken asset ids
 * `useAssetIdValidation` checks a typed value against (standing in for the
 * `itemsSearchByAssetId`/`itemsCountByAssetPrefix` round trips), a candidate
 * pool for the create-mode connections search, and a half-typed draft for
 * the "dirty form" state.
 */
import { inventoryItems } from './inventory-items';

import type { ItemFormValues } from '@/kit/inventory/item-form/types';
import type { TakenAssetId } from '@/kit/inventory/item-form/use-asset-id-validation';

/** Every asset id already in use, keyed the way `itemsSearchByAssetId` would answer. */
export const takenAssetIds: TakenAssetId[] = inventoryItems
  .filter(
    (item): item is (typeof inventoryItems)[number] & { assetId: string } => item.assetId !== null
  )
  .map((item) => ({ id: item.id, assetId: item.assetId, itemName: item.itemName }));

/** An asset id nothing in {@link takenAssetIds} holds, for the "free" check. */
export const freeAssetId = 'ELEC99';

function mustFind<T>(items: readonly T[], predicate: (item: T) => boolean, description: string): T {
  const found = items.find(predicate);
  if (!found) throw new Error(`Fixture data missing expected entry: ${description}`);
  return found;
}

/** An asset id already taken by another item, for the "taken" check. */
export const takenAssetIdSample = mustFind(
  takenAssetIds,
  (t) => t.assetId === 'HI-0002',
  'takenAssetIds entry with assetId "HI-0002"'
);

/** A half-typed create-mode draft, for the "dirty form" state. */
export const draftInProgress: Partial<ItemFormValues> = {
  itemName: 'Sony WH-1000XM6 headphones',
  brand: 'Sony',
  model: 'WH-1000XM6',
  type: 'Electronics',
};
