/**
 * The shape every inventory fixture item takes, and the helpers the two
 * catalogue modules beside this one build their literals with.
 *
 * `InventoryFixtureItem` matches what `GET /items` serves for a row and
 * `GET /items/{id}` serves for a record: they are the same object, so the list
 * and the detail screen cannot disagree about a field.
 */
import { locationNameById } from './inventory-locations';

/** As `INVENTORY_CONDITIONS` lists them, newest spelling first. */
export const inventoryConditions = ['Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken'] as const;

export type InventoryConditionFixture = (typeof inventoryConditions)[number];

export interface InventoryFixtureItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
  type: string | null;
  condition: string | null;
  location: string | null;
  locationId: string | null;
  room: string | null;
  inUse: boolean;
  deductible: boolean;
  notes: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  replacementValue: number | null;
  resaleValue: number | null;
  warrantyExpires: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
  purchaseTransactionId: string | null;
  itemId: string | null;
  lastEditedTime: string;
}

const names = locationNameById();

/**
 * The `locationId` plus the flat `location` label a row carries for it, kept
 * in step so no fixture names a place the tree does not have.
 */
export function at(locationId: string): { locationId: string; location: string } {
  return { locationId, location: names.get(locationId) ?? locationId };
}
