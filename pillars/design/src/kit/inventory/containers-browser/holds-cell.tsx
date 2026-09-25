/**
 * What a container holds, in the table's second column: the count directly
 * inside, and how many more sit in boxes within it.
 */
import { holds } from './containers-model';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** The Holds cell. */
export function HoldsCell({ item, world }: { item: ItemRowModel; world: PlacementWorld }) {
  const { direct, deep } = holds(world, item.id);
  if (direct === 0) return <span className="text-xs text-muted-foreground">Empty</span>;
  return (
    <span className="text-xs leading-4 tabular-nums">
      {direct} {direct === 1 ? 'thing' : 'things'}
      {deep > direct ? (
        <span className="text-muted-foreground">{`, ${String(deep - direct)} nested`}</span>
      ) : null}
    </span>
  );
}
