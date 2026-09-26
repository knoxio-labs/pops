/**
 * The shared selection bar as every list in this unit docks it: the count,
 * what the selected containers carry, and the verbs, all off (with the
 * reason) while offline.
 */
import { SelectionBar } from '../foundation';
import { carriedCount } from './selection-actions';

import type { PlacementWorld, SelectionApi, SelectionBarAction } from '../foundation';

/** Props for {@link SelectionDock}. */
export interface SelectionDockProps {
  world: PlacementWorld;
  selection: SelectionApi;
  loadedCount: number;
  actions: readonly SelectionBarAction[];
  offline?: boolean;
}

/** The docked selection bar. */
export function SelectionDock({
  world,
  selection,
  loadedCount,
  actions,
  offline,
}: SelectionDockProps) {
  const ids = selection.selectedIds;
  return (
    <SelectionBar
      count={selection.count}
      loadedCount={loadedCount}
      coverage={selection.coverage}
      actions={
        offline === true
          ? actions.map((action) => ({ ...action, disabledReason: 'No connection' }))
          : actions
      }
      carriedCount={carriedCount(world, ids)}
      onSelectAll={selection.onHeaderToggle}
      onClear={selection.clearSelection}
    />
  );
}
