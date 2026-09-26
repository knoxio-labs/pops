/**
 * The numbers the Overview shows, derived from the same world every list
 * reads, so a tile can never disagree with the page it opens.
 */
import { deepContents, directContents } from '../shared/placement-model';

import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

/** The count tiles. */
export interface OverviewCounts {
  /** Active records that are not containers. */
  items: number;
  /** The same records counted by quantity: 6 mugs are 6. */
  things: number;
  containers: number;
  openContainers: number;
  locations: number;
  inHand: number;
}

function active(world: PlacementWorld): ItemRowModel[] {
  return [...world.items.values()].filter((entry) => entry.lifecycle === 'active');
}

/** Counts for the tiles. Retired, discarded, lost and destroyed records do not count. */
export function overviewCounts(world: PlacementWorld): OverviewCounts {
  const live = active(world);
  const items = live.filter((entry) => entry.container === null);
  const containers = live.filter((entry) => entry.container !== null);
  return {
    items: items.length,
    things: items.reduce((sum, entry) => sum + entry.quantity, 0),
    containers: containers.length,
    openContainers: containers.filter((entry) => entry.container?.access === 'open').length,
    locations: world.locations.size,
    inHand: live.filter((entry) => entry.placement.kind === 'in-hand').length,
  };
}

/** One row of the open containers panel. */
export interface OpenContainerRow {
  container: ItemRowModel;
  /** Things directly inside, not counting inside nested boxes. */
  directCount: number;
}

/** Active open containers, most recently touched first. */
export function openContainerRows(world: PlacementWorld): OpenContainerRow[] {
  return active(world)
    .filter((entry) => entry.container?.access === 'open')
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((container) => ({
      container,
      directCount: directContents(world, container.id).length,
    }));
}

/** Where a move stands: boxes closed so far, and what they hold. */
export interface MovingProgress {
  closed: number;
  total: number;
  open: number;
  full: number;
  /** Every thing inside a closed box, nested boxes included. */
  packed: number;
}

/** Progress across the active containers. */
export function movingProgress(world: PlacementWorld): MovingProgress {
  const boxes = active(world).filter((entry) => entry.container !== null);
  const closed = boxes.filter((entry) => entry.container?.access === 'closed');
  return {
    closed: closed.length,
    total: boxes.length,
    open: boxes.length - closed.length,
    full: boxes.filter((entry) => entry.container?.full === true).length,
    packed: closed.reduce((sum, box) => sum + deepContents(world, box.id).length, 0),
  };
}
