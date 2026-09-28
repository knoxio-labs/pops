import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

function accessAction(
  world: PlacementWorld,
  ids: readonly string[],
  onAccess: (access: 'open' | 'closed') => void
): SelectionBarAction {
  const allClosed =
    ids.length > 0 && ids.every((id) => world.items.get(id)?.container?.access === 'closed');
  const access = allClosed ? 'open' : 'closed';
  return {
    id: access === 'open' ? 'open' : 'close',
    label: allClosed ? 'Open' : 'Close',
    icon: allClosed ? INVENTORY_ICONS.open : INVENTORY_ICONS.closed,
    onSelect: () => onAccess(access),
  };
}

/** Inserts the container access verb into the shared item action order. */
export function containerActions(
  world: PlacementWorld,
  ids: readonly string[],
  itemActions: readonly SelectionBarAction[],
  onAccess: (access: 'open' | 'closed') => void
): SelectionBarAction[] {
  const actions = itemActions.map((action) =>
    action.id === 'set-field' ? { ...action, overflow: true } : action
  );
  return [...actions.slice(0, 2), accessAction(world, ids, onAccess), ...actions.slice(2)];
}
