/**
 * The shared selection bar with the verbs a place's contents take. Take out
 * is live only when everything selected is inside a box; otherwise it says
 * why, like everywhere else.
 */

import { INVENTORY_ICONS, SelectionBar, deepContents } from '../foundation';

import type { PlacementWorld, SelectionApi, SelectionBarAction } from '../foundation';
import type { ItemActionsApi } from './use-item-actions';

const I = INVENTORY_ICONS;

function barActions(
  world: PlacementWorld,
  ids: readonly string[],
  verbs: ItemActionsApi
): SelectionBarAction[] {
  const allBoxed = ids.every((id) => world.items.get(id)?.placement.kind === 'container');
  return [
    {
      id: 'pick-up',
      label: 'Pick up',
      icon: I.pickUp,
      shortcutId: 'pick-up',
      onSelect: () => verbs.pickUp(ids),
    },
    {
      id: 'move',
      label: 'Move',
      icon: I.move,
      shortcutId: 'move',
      onSelect: () => verbs.startMove(ids),
    },
    {
      id: 'take-out',
      label: 'Take out',
      icon: I.takeOut,
      shortcutId: 'take-out',
      onSelect: () => verbs.takeOut(ids),
      disabledReason: allBoxed ? undefined : 'Only for things inside a box',
    },
    { id: 'label', label: 'Print labels', icon: I.label, overflow: true },
    { id: 'retire', label: 'Retire', icon: I.retired, overflow: true },
    { id: 'discard', label: 'Discard', icon: I.discarded, overflow: true },
  ];
}

/** The bar, or nothing while no row is selected. */
export function ContentsSelectionBar({
  world,
  selection,
  loadedCount,
  verbs,
}: {
  world: PlacementWorld;
  selection: SelectionApi;
  loadedCount: number;
  verbs: ItemActionsApi;
}) {
  const ids = selection.selectedIds;
  const carried = ids.reduce((sum, id) => sum + deepContents(world, id).length, 0);
  return (
    <SelectionBar
      count={selection.count}
      loadedCount={loadedCount}
      coverage={selection.coverage}
      actions={barActions(world, ids, verbs)}
      carriedCount={carried}
      onSelectAll={selection.onHeaderToggle}
      onClear={selection.clearSelection}
    />
  );
}
