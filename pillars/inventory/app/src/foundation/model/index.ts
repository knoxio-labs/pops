/** Inventory foundation component contracts. */
export type {
  PaletteArgumentKind,
  PaletteCommand,
  PaletteGroupId,
  PickerSubject,
  PlacementPickerProps,
  SelectionBarAction,
  StoreHereSheetProps,
  StoreHereTarget,
} from './contracts';

/** Inventory concept names with canonical Lucide icons. */
export { INVENTORY_ICONS } from './icons';
export type { InventoryConcept } from './icons';

/** Core inventory item, location, placement, lifecycle, and event shapes. */
export type {
  ContainerAccess,
  ContainerFacts,
  EventActor,
  EventKind,
  EventModel,
  FixedPlacement,
  ItemRowModel,
  Lifecycle,
  LocationKind,
  LocationModel,
  Placement,
  PlacementTarget,
  PreviousPlacement,
  SyncState,
} from './model';

/** Pure placement-world construction and query helpers. */
export {
  buildWorld,
  deepContents,
  directContents,
  effectiveLocationId,
  isLocationWithin,
  isWithin,
  locationPath,
  placementTrail,
  previousTrail,
  samePlacement,
  targetName,
} from './placement-model';
export type { PathSegment, PlacementWorld } from './placement-model';
