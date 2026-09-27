import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';

import type { InventoryConcept } from '../../../foundation/model/icons.js';
import type { FixedPlacement, PlacementTarget } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { UnpackAction } from './unpack-model.js';

/** Merges the detail and direct-content placement snapshots by stable item id. */
export function mergeWorld(left: PlacementWorld, right: PlacementWorld): PlacementWorld {
  const items = new Map(left.items);
  for (const item of right.items.values()) items.set(item.id, item);
  const locations = new Map(left.locations);
  for (const location of right.locations.values()) locations.set(location.id, location);
  return { items, locations };
}

/** Converts a placement-picker result into the bulk-verb target shape. */
export function fixedTarget(target: PlacementTarget): FixedPlacement | null {
  return target.kind === 'in-hand' ? null : target;
}

/** Returns the load error title for online and offline states. */
export function contentsErrorTitle(offline: boolean): string {
  return offline ? 'No connection. Showing what loaded.' : 'Could not load container contents.';
}

/** Returns the load error detail for online and offline states. */
export function contentsErrorDetail(offline: boolean): string {
  return offline
    ? 'No connection. Changes are off until it is back.'
    : 'Retry to read the items directly inside this container.';
}

/** Restores only bulk mutations that the server refused or could not apply. */
export function restoreUnapplied(
  dispatch: (action: UnpackAction) => void,
  ids: readonly string[],
  applied: readonly string[]
): void {
  const appliedIds = new Set(applied);
  dispatch({ type: 'restore', ids: ids.filter((id) => !appliedIds.has(id)) });
}

/** Shows one undo action for an applied bulk mutation and restores its rows on undo. */
export function showBulkUndo(
  result: { applied: readonly string[]; undo: (() => Promise<void>) | null },
  concept: InventoryConcept,
  message: string,
  dispatch: (action: UnpackAction) => void
): void {
  if (result.applied.length === 0 || result.undo === null) return;
  const applied = [...result.applied];
  showUndoToast({
    concept,
    message,
    onUndo: async () => {
      if (result.undo === null) return;
      await result.undo();
      dispatch({ type: 'restore', ids: applied });
    },
  });
}
