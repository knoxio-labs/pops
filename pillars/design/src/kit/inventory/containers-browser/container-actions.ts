import { INVENTORY_ICONS } from '../foundation';
/**
 * The selection bar over containers: the item verbs, with Close (or Open,
 * when every selected box is closed) promoted to the bar, because packing
 * is what this page is for. Set field moves under More to make room.
 */
import { itemSelectionActions } from '../items-list/selection-actions';

import type { PlacementWorld, SelectionBarAction } from '../foundation';

function accessVerb(world: PlacementWorld, ids: readonly string[]): SelectionBarAction {
  const allClosed =
    ids.length > 0 && ids.every((id) => world.items.get(id)?.container?.access === 'closed');
  return allClosed
    ? { id: 'open', label: 'Open', icon: INVENTORY_ICONS.open }
    : { id: 'close', label: 'Close', icon: INVENTORY_ICONS.closed };
}

/** Bar verbs for selected containers. */
export function containerActions(
  world: PlacementWorld,
  ids: readonly string[]
): SelectionBarAction[] {
  const base = itemSelectionActions(world, ids).map((action) =>
    action.id === 'set-field' ? { ...action, overflow: true } : action
  );
  return [...base.slice(0, 2), accessVerb(world, ids), ...base.slice(2)];
}
