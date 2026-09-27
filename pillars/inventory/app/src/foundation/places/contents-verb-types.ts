import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { ShortcutHandlers } from '../shortcuts/shortcut-provider.js';

/** The two reversible lifecycle actions exposed by a place contents list. */
export type ContentsLifecycleAct = 'retire' | 'discard';

/** Commands and state shared by contents rows, the selection bar, and overlays. */
export interface ContentsVerbs {
  moving: readonly string[] | null;
  startMove: (ids: readonly string[]) => void;
  cancelMove: () => void;
  moveIds: (ids: readonly string[], target: PlacementTarget, world: PlacementWorld) => void;
  moveTo: (target: PlacementTarget, world: PlacementWorld) => void;
  pickUp: (ids: readonly string[]) => void;
  takeOut: (ids: readonly string[]) => void;
  label: (ids: readonly string[]) => void;
  lifecycle: { act: ContentsLifecycleAct; ids: readonly string[] } | null;
  startLifecycle: (act: ContentsLifecycleAct, ids: readonly string[]) => void;
  cancelLifecycle: () => void;
  confirmLifecycle: (reason: string | null) => void;
  rejections: Readonly<Record<string, string>>;
  pendingIds: ReadonlySet<string>;
  disabledReason?: string;
  keyHandlersFor: (ids: readonly string[]) => ShortcutHandlers;
}
