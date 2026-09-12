/**
 * A derived fixture for the items list screen only: every item's
 * `replacementValue` and `resaleValue` are null, so the summary pill's two
 * value clauses (the `— $X replacement` and `— $X resale` spans) both drop
 * out. Built on
 * top of {@link inventoryItems} rather than replacing it, so everything else
 * about the rows (condition mix, location shapes, missing fields) stays the
 * same set the base fixture was chosen for.
 */
import { inventoryItems, type InventoryFixtureItem } from './inventory-items';

export const inventoryItemsNoValues: InventoryFixtureItem[] = inventoryItems.map((item) => ({
  ...item,
  replacementValue: null,
  resaleValue: null,
}));
