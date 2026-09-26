/**
 * Inventory pillar table barrel.
 *
 * Canonical definitions for inventory-owned tables (items, events, mutations,
 * media, sync_meta, locations, fixtures, item_connections,
 * item_fixture_connections, item_documents, item_photos, item_uploaded_files,
 * settings, device_sync_ledgers).
 */
export {
  EVENT_ACTOR_KINDS,
  EVENT_ENTITY_KINDS,
  events,
  type EventActorKind,
  type EventEntityKind,
} from './schema/events.js';
export { fixtures } from './schema/fixtures.js';
export { itemConnections } from './schema/item-connections.js';
export { itemDocuments } from './schema/item-documents.js';
export { itemFixtureConnections } from './schema/item-fixture-connections.js';
export { itemPhotos } from './schema/item-photos.js';
export { itemUploadedFiles } from './schema/item-uploaded-files.js';
export {
  CATALOGUE_REVISION_STATUSES,
  catalogueCompatibility,
  catalogueEvents,
  catalogueRevisions,
  type CatalogueRevisionStatus,
} from './schema/catalogue-history.js';
export { fieldEnumOptions, itemTypeFields, itemTypes } from './schema/catalogue.js';
export {
  computedDependencyIndexState,
  itemComputedDependencies,
} from './schema/item-computed-dependencies.js';
export {
  ITEM_FIELD_VALUE_SOURCES,
  itemFieldValues,
  type ItemFieldValueSource,
} from './schema/item-field-values.js';
export {
  ACCESS_STATES,
  items,
  LIFECYCLES,
  PLACEMENT_KINDS,
  type AccessState,
  type Lifecycle,
  type PlacementKind,
} from './schema/items.js';
export { locations } from './schema/locations.js';
export { media } from './schema/media.js';
export { MUTATION_STATUSES, mutations, type MutationStatus } from './schema/mutations.js';
export { settings } from './schema/settings.js';
export { deviceSyncLedgers } from './schema/device-sync-ledgers.js';
export { SYNC_META_KEYS, syncMeta, type SyncMetaKey } from './schema/sync-meta.js';
