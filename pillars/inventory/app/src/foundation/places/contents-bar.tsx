import { MAX_LABEL_IDS } from '../../pages/labels-page/label-params.js';
import { canLabel } from '../list-page/selection-actions.js';
import { INVENTORY_ICONS } from '../model/icons.js';
import { deepContents } from '../model/placement-model.js';
import { SelectionBar } from '../selection/selection-bar.js';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../model/contracts.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { ContentsVerbs } from './use-contents-verbs.js';

function primaryActions({
  ids,
  verbs,
  offline,
  allBoxed,
}: {
  ids: readonly string[];
  verbs: ContentsVerbs;
  offline: string | undefined;
  allBoxed: boolean;
}): SelectionBarAction[] {
  return [
    {
      id: 'pick-up',
      label: 'Pick up',
      icon: INVENTORY_ICONS.pickUp,
      shortcutId: 'pick-up',
      disabledReason: offline,
      onSelect: () => verbs.pickUp(ids),
    },
    {
      id: 'move',
      label: 'Move',
      icon: INVENTORY_ICONS.move,
      shortcutId: 'move',
      disabledReason: offline,
      onSelect: () => verbs.startMove(ids),
    },
    {
      id: 'take-out',
      label: 'Take out',
      icon: INVENTORY_ICONS.takeOut,
      shortcutId: 'take-out',
      disabledReason: offline ?? (allBoxed ? undefined : 'Only for things inside a box'),
      onSelect: () => verbs.takeOut(ids),
    },
  ];
}

function overflowActions({
  ids,
  verbs,
  offline,
}: {
  ids: readonly string[];
  verbs: ContentsVerbs;
  offline: string | undefined;
}): SelectionBarAction[] {
  return [
    {
      id: 'label',
      label: 'Print labels',
      icon: INVENTORY_ICONS.label,
      disabledReason:
        offline ??
        (ids.length > MAX_LABEL_IDS
          ? `Print labels takes at most ${MAX_LABEL_IDS} items`
          : undefined),
      overflow: true,
      onSelect: () => verbs.label(ids),
    },
    {
      id: 'retire',
      label: 'Retire',
      icon: INVENTORY_ICONS.retired,
      disabledReason: offline,
      overflow: true,
      onSelect: () => verbs.startLifecycle('retire', ids),
    },
    {
      id: 'discard',
      label: 'Discard',
      icon: INVENTORY_ICONS.discarded,
      disabledReason: offline,
      overflow: true,
      onSelect: () => verbs.startLifecycle('discard', ids),
    },
  ];
}

function selectionActions({
  world,
  ids,
  verbs,
}: {
  world: PlacementWorld;
  ids: readonly string[];
  verbs: ContentsVerbs;
}): SelectionBarAction[] {
  const allBoxed =
    ids.length > 0 && ids.every((id) => world.items.get(id)?.placement.kind === 'container');
  const offline = verbs.disabledReason;
  return [
    ...primaryActions({ ids, verbs, offline, allBoxed }),
    ...overflowActions({ ids, verbs, offline }),
  ];
}

/** Renders the bulk actions for a selected place-contents list. */
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
  const actions = selectionActions({ world, ids, verbs });
  return (
    <SelectionBar
      count={selection.count}
      loadedCount={ids.length}
      coverage={selection.coverage}
      actions={actions}
      carriedCount={ids.reduce((total, id) => total + deepContents(world, id).length, 0)}
      onSelectAll={selection.onHeaderToggle}
      onClear={selection.clearSelection}
    />
  );
}

/** Returns whether a place-contents selection can use Take out. */
export function canTakeOutSelection(world: PlacementWorld, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => world.items.get(id)?.placement.kind === 'container');
}

/** Returns the label overflow reason used by the selection bar and keyboard command. */
export function labelDisabledReason(ids: readonly string[]): string | undefined {
  return canLabel(ids) ? undefined : `Print labels takes at most ${MAX_LABEL_IDS} items`;
}
