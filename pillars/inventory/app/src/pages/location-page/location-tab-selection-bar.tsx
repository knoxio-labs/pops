import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { deepContents, type PlacementWorld } from '../../foundation/model/placement-model.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';

import type { ReactElement } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { ContentsVerbs } from './location-tab-content-model.js';

/** Renders bulk item actions for the current location tab selection. */
export function ContentsSelectionBar({
  world,
  selection,
  verbs,
}: {
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
}): ReactElement | null {
  if (selection.count === 0) return null;
  const ids = selection.selectedIds;
  const allBoxed = ids.every((id) => world.items.get(id)?.placement.kind === 'container');
  return (
    <SelectionBar
      count={selection.count}
      loadedCount={ids.length}
      coverage={selection.coverage}
      actions={[
        {
          id: 'pick-up',
          label: 'Pick up',
          icon: INVENTORY_ICONS.pickUp,
          shortcutId: 'pick-up',
          disabledReason: verbs.disabledReason,
          onSelect: () => verbs.pickUp(ids),
        },
        {
          id: 'move',
          label: 'Move',
          icon: INVENTORY_ICONS.move,
          shortcutId: 'move',
          disabledReason: verbs.disabledReason,
          onSelect: () => verbs.startMove(ids),
        },
        {
          id: 'take-out',
          label: 'Take out',
          icon: INVENTORY_ICONS.takeOut,
          shortcutId: 'take-out',
          disabledReason:
            verbs.disabledReason ?? (allBoxed ? undefined : 'Only for things inside a box'),
          onSelect: () => verbs.takeOut(ids),
        },
      ]}
      carriedCount={ids.reduce((total, id) => total + deepContents(world, id).length, 0)}
      onSelectAll={selection.onHeaderToggle}
      onClear={selection.clearSelection}
    />
  );
}
