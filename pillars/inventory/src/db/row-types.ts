/**
 * `Row` aliases for the inventory-owned tables.
 *
 * Centralised here so in-pillar consumers can `import type { LocationRow }
 * from './row-types.js'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts`.
 */
import type {
  events,
  fixtures,
  itemConnections,
  itemDocuments,
  itemFieldValues,
  itemTypeFields,
  itemTypes,
  itemFixtureConnections,
  itemPhotos,
  items,
  itemUploadedFiles,
  locations,
  media,
  mutations,
} from './schema.js';

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type FixtureRow = typeof fixtures.$inferSelect;
export type FixtureInsert = typeof fixtures.$inferInsert;
export type ItemRow = typeof items.$inferSelect;
export type ItemInsert = typeof items.$inferInsert;
export type ItemFieldValueRow = typeof itemFieldValues.$inferSelect;
export type ItemFieldValueInsert = typeof itemFieldValues.$inferInsert;
export type ItemTypeRow = typeof itemTypes.$inferSelect;
export type ItemTypeInsert = typeof itemTypes.$inferInsert;
export type ItemTypeFieldRow = typeof itemTypeFields.$inferSelect;
export type ItemTypeFieldInsert = typeof itemTypeFields.$inferInsert;
export type ItemConnectionRow = typeof itemConnections.$inferSelect;
export type ItemConnectionInsert = typeof itemConnections.$inferInsert;
export type ItemDocumentRow = typeof itemDocuments.$inferSelect;
export type ItemDocumentInsert = typeof itemDocuments.$inferInsert;
export type ItemFixtureConnectionRow = typeof itemFixtureConnections.$inferSelect;
export type ItemFixtureConnectionInsert = typeof itemFixtureConnections.$inferInsert;
export type ItemPhotoRow = typeof itemPhotos.$inferSelect;
export type ItemPhotoInsert = typeof itemPhotos.$inferInsert;
export type ItemUploadedFileRow = typeof itemUploadedFiles.$inferSelect;
export type ItemUploadedFileInsert = typeof itemUploadedFiles.$inferInsert;
export type LocationRow = typeof locations.$inferSelect;
export type LocationInsert = typeof locations.$inferInsert;
export type MediaRow = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
export type MutationRow = typeof mutations.$inferSelect;
export type MutationInsert = typeof mutations.$inferInsert;

/**
 * Allowed values for `items.condition`. Stored title-case in the DB
 * but matched case-insensitively in the items list filter, so the values can
 * be used directly in both the edit form and the filter dropdown without
 * casing transforms.
 */
export const INVENTORY_CONDITIONS = ['Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken'] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
