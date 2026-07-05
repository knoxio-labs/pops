/**
 * Allowed values for `home_inventory.condition`. Stored title-case in the DB
 * but matched case-insensitively in the items list filter, so the values can
 * be used directly in both the edit form and the filter dropdown without
 * casing transforms.
 *
 * Kept as a contract-level copy — separate from the db-level copy in
 * `src/db/row-types.ts` — so consumers of `@pops/inventory` (the app's item
 * form/filters) get the value without a workspace dependency on inventory's
 * backend package.
 */
export const INVENTORY_CONDITIONS = ['Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken'] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
