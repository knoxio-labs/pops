import type { LucideIcon } from 'lucide-react';

import type { ItemRowModel, PlacementTarget } from './model';
import type { PlacementWorld } from './placement-model';

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
export type { PathSegment, PlacementWorld } from './placement-model';

/** One action exposed by the shared selection bar. */
export interface SelectionBarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A shortcut registry ID whose keys render as the button hint. */
  shortcutId?: string;
  onSelect?: () => void;
  /** The disabled explanation, also used as the action tooltip. */
  disabledReason?: string;
  /** Whether the action belongs in the overflow menu instead of the bar. */
  overflow?: boolean;
}

/** Command-palette result groups in display order. */
export type PaletteGroupId = 'recents' | 'this-item' | 'commands' | 'jump-to' | 'records';

/** Additional input a palette command requires before execution. */
export type PaletteArgumentKind = 'placement' | 'type' | 'lifecycle-reason';

/** One searchable and executable command-palette entry. */
export interface PaletteCommand {
  id: string;
  label: string;
  group: PaletteGroupId;
  icon: LucideIcon;
  /** Extra searchable terms such as codes, paths, or synonyms. */
  keywords?: readonly string[];
  /** Secondary copy such as a record path or page purpose. */
  detail?: string;
  shortcutId?: string;
  argument?: PaletteArgumentKind;
  run?: () => void;
}

/** The item selection or location being moved by the placement picker. */
export type PickerSubject =
  | { kind: 'items'; ids: readonly string[] }
  | { kind: 'place'; locationId: string };

/** Inputs and callbacks for the shared placement picker. */
export interface PlacementPickerProps {
  world: PlacementWorld;
  subject: PickerSubject;
  recents: readonly PlacementTarget[];
  onPick: (target: PlacementTarget) => void;
  /** Present when the picker may create a location inline. */
  onCreatePlace?: (name: string, parentId: string | null) => void;
  initialQuery?: string;
  initialDrillId?: string | null;
}

/** A location or container accepted by the Store here flow. */
export interface StoreHereTarget {
  kind: 'location' | 'container';
  id: string;
  name: string;
  /** Container availability; closed refuses storage while full warns. */
  state?: 'open' | 'closed' | 'full';
}

/** Inputs and callbacks for the shared Store here sheet. */
export interface StoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  world: PlacementWorld;
  initialTab?: 'new' | 'existing';
  /** Creates a new item in the target. */
  onCreate?: (name: string) => void;
  /** Moves selected existing items into the target. */
  onStoreExisting?: (items: readonly ItemRowModel[]) => void;
}
