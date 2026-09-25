/**
 * Cross-unit contracts for the inventory web design. Units import shapes only
 * from here (or through the foundation barrel), never from another unit's
 * components, so parallel work meets at typed seams.
 */
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

/** One verb on the shared selection bar. `disabledReason` doubles as its tooltip. */
export interface SelectionBarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A shortcut registry id; its keys render as the button's hint. */
  shortcutId?: string;
  onSelect?: () => void;
  disabledReason?: string;
  /** Sent to the More menu instead of the bar. */
  overflow?: boolean;
}

/** The palette's result groups, in the order they render. */
export type PaletteGroupId = 'recents' | 'this-item' | 'commands' | 'jump-to' | 'records';

/** What a command asks for before it can run: a Move needs a target. */
export type PaletteArgumentKind = 'placement' | 'type' | 'lifecycle-reason';

/** One entry the palette can show and run. */
export interface PaletteCommand {
  id: string;
  label: string;
  group: PaletteGroupId;
  icon: LucideIcon;
  /** Extra words a query may match: codes, paths, synonyms. */
  keywords?: readonly string[];
  /** Secondary line: a record's placement path, a page's purpose. */
  detail?: string;
  shortcutId?: string;
  argument?: PaletteArgumentKind;
  run?: () => void;
}

/** Who the placement picker is placing: items (one or many) or a location being moved. */
export type PickerSubject =
  | { kind: 'items'; ids: readonly string[] }
  | { kind: 'place'; locationId: string };

/** Props of the one placement picker (iOS parity #11). */
export interface PlacementPickerProps {
  world: PlacementWorld;
  subject: PickerSubject;
  recents: readonly PlacementTarget[];
  onPick: (target: PlacementTarget) => void;
  /** Present when the picker may create a place inline. */
  onCreatePlace?: (name: string, parentId: string | null) => void;
  initialQuery?: string;
  initialDrillId?: string | null;
}

/** The container or location a Store here sheet puts things into. */
export interface StoreHereTarget {
  kind: 'location' | 'container';
  id: string;
  name: string;
  /** Containers only: closed refuses, full warns. */
  state?: 'open' | 'closed' | 'full';
}

/** Props of the Store here sheet, which U4 implements and U3/U5 open. */
export interface StoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  world: PlacementWorld;
  initialTab?: 'new' | 'existing';
  /** Creates one new item in the target and returns to the sheet. */
  onCreate?: (name: string) => void;
  /** Moves existing items into the target. */
  onStoreExisting?: (items: readonly ItemRowModel[]) => void;
}
