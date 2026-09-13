/**
 * The inventory items every item-facing screen reads.
 *
 * The literals live in the two catalogue modules beside this one, split only
 * to keep each file readable; this module is what screens import. The set is
 * chosen so that a screen rendering it hits every branch its cells have: each
 * condition value including the legacy title-case ones, a row with no asset
 * id, one with no location at all, one located only by free text with no
 * `locationId` to breadcrumb from, null brand/model, null values, a warranty
 * already expired and one expiring within the month.
 */
import { poweredInventoryItems } from './inventory-items-powered';
import { unpoweredInventoryItems } from './inventory-items-unpowered';

import type { InventoryFixtureItem } from './inventory-item-shape';

export { at, inventoryConditions } from './inventory-item-shape';
export type { InventoryConditionFixture, InventoryFixtureItem } from './inventory-item-shape';

export const inventoryItems: InventoryFixtureItem[] = [
  ...poweredInventoryItems,
  ...unpoweredInventoryItems,
];

export const inventoryItemsEmpty: InventoryFixtureItem[] = [];

/** The single item the detail and edit screens open on. */
export { televisionItem as inventoryItem } from './inventory-items-powered';

/** An item with every optional field unset: the detail screen's thinnest record. */
export const inventoryItemMinimal: InventoryFixtureItem = {
  id: 'itm-bare',
  itemName: 'Unlabelled box of cables',
  assetId: null,
  brand: null,
  model: null,
  type: null,
  condition: null,
  location: null,
  locationId: null,
  room: null,
  inUse: false,
  deductible: false,
  notes: null,
  purchaseDate: null,
  purchasePrice: null,
  replacementValue: null,
  resaleValue: null,
  warrantyExpires: null,
  purchasedFromId: null,
  purchasedFromName: null,
  purchaseTransactionId: null,
  itemId: null,
  lastEditedTime: '2026-09-04T00:00:00.000Z',
};

function sum(pick: (item: InventoryFixtureItem) => number | null): number {
  return inventoryItems.reduce((total, item) => total + (pick(item) ?? 0), 0);
}

export const inventoryItemTotals = {
  totalReplacementValue: sum((item) => item.replacementValue),
  totalResaleValue: sum((item) => item.resaleValue),
};

export const inventoryItemsPagination = {
  total: inventoryItems.length,
  limit: 200,
  offset: 0,
  hasMore: false,
};

/** What `GET /items/types` answers for {@link inventoryItems}. */
export const inventoryTypes: string[] = [
  ...new Set(
    inventoryItems.map((item) => item.type).filter((type): type is string => type !== null)
  ),
].sort((a, b) => a.localeCompare(b));
