/**
 * The inventory web foundation: every shared model, control and contract
 * the unit screens (overview, items, detail, form, locations, connections)
 * build against. Units import from here, never from each other.
 */
export * from './shared/contracts';
export { INVENTORY_ICONS } from './shared/icons';
export type { InventoryConcept } from './shared/icons';
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
} from './shared/placement-model';
export {
  CodeBadge,
  ConceptBadge,
  ContainerStateBadge,
  InHandBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from './shared/badges';
export type { BadgeTone } from './shared/badges';
export { PlacementPath, visibleSegments } from './shared/placement-path';
export type { PlacementPathProps } from './shared/placement-path';
export { ItemMark } from './shared/item-mark';
export type { ItemMarkProps } from './shared/item-mark';
export { ItemList, ItemRow, RowVerb } from './shared/item-row';
export type { ItemRowProps, RowDensity, RowVerbProps } from './shared/item-row';
export { itemTableColumns } from './shared/item-table-columns';
export type { ItemColumnId, ItemTableColumnOptions } from './shared/item-table-columns';
export { UNDO_WINDOW_MS, UndoToast, showUndoToast } from './shared/undo-toast';
export type { UndoToastProps, UndoToastState } from './shared/undo-toast';
export { OFFLINE_REASON, OFFLINE_TITLE, StateBanner } from './shared/state-banner';
export type { StateBannerKind, StateBannerProps } from './shared/state-banner';
export { SelectionBar } from './shared/selection-bar';
export type { SelectionBarProps } from './shared/selection-bar';
export {
  EMPTY_SELECTION,
  applySelectionKey,
  clear,
  coverageOf,
  extendTo,
  moveFocus,
  reconcile,
  selectAll,
  selectedInOrder,
  toggle,
  useSelection,
} from './shared/use-selection';
export type {
  SelectionApi,
  SelectionCoverage,
  SelectionKey,
  SelectionState,
} from './shared/use-selection';
export {
  SCOPE_TITLES,
  SHORTCUTS,
  bindingsFor,
  createSequenceMatcher,
  findConflicts,
  formatCombo,
  isTypingTarget,
  matchesCombo,
  parseCombo,
  shortcut,
} from './shared/shortcuts';
export type {
  Combo,
  KeyInput,
  SequenceMatcher,
  ShortcutBinding,
  ShortcutConflict,
  ShortcutScope,
} from './shared/shortcuts';
export { Kbd, KeyCombo, ShortcutHint } from './shared/kbd';
export { HintTooltip } from './shared/hint-tooltip';
export type { HintTooltipProps } from './shared/hint-tooltip';
export { ShortcutSheet, ShortcutSheetBody } from './shared/shortcut-sheet';
export { Sheet, SheetPanel } from './shared/sheet';
export type { SheetContentProps, SheetProps } from './shared/sheet';
export { AccentTile, InventoryPage, PAGE_HEIGHT } from './shared/page-frame';
export type { InventoryPageProps } from './shared/page-frame';
export { NewItemButton } from './shared/new-item-button';
export { Segmented } from './shared/segmented';
export type { Segment, SegmentedProps } from './shared/segmented';
export { DROP_TARGET_CLASS, DragDock, DragGhost, DropHint } from './shared/drag-dock';
export type { DragDockProps } from './shared/drag-dock';
export { dragSet, useDragPlacement } from './shared/use-drag-placement';
export type { DragPlacementApi, DropTargetState } from './shared/use-drag-placement';
export { CommandPalette, CommandPalettePanel } from './command-palette/command-palette';
export type { CommandPalettePanelProps } from './command-palette/command-palette';
export {
  SEE_ALL_RESULTS_ID,
  buildSections,
  rankEntries,
  rankMatch,
  searchResultsHref,
  seeAllResultsEntry,
} from './command-palette/palette-groups';
export type {
  PaletteScope,
  PaletteSection,
  PaletteSource,
  PaletteStep,
} from './command-palette/palette-groups';
export {
  INITIAL_PALETTE,
  choosePaletteEntry,
  paletteKey,
  paletteReducer,
  usePaletteState,
} from './command-palette/use-palette-state';
export type {
  PaletteAction,
  PaletteApi,
  PaletteChoice,
  PaletteState,
} from './command-palette/use-palette-state';
export { PlacementPicker, PlacementPickerPanel } from './placement-picker/placement-picker';
export { derivePicker, usePickerState } from './placement-picker/use-picker-state';
export type {
  PickerApi,
  PickerInput,
  PickerModel,
  PickerOption,
  PickerPosition,
} from './placement-picker/use-picker-state';
export { MovePlanPanel } from './move-plan/move-plan';
export type { MovePlanPanelProps } from './move-plan/move-plan';
export {
  affectedCount,
  dropVerdict,
  planIsApplicable,
  planMove,
  refusalText,
} from './move-plan/move-plan-model';
export type {
  DropVerdict,
  MoveBlocker,
  MovePlan,
  MovePlanInput,
  TargetRefusal,
} from './move-plan/move-plan-model';
