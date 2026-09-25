/**
 * Moving day as numbers someone packing can act on: every box and its stage
 * (still packing, full but not closed, closed), how much is packed, what is
 * still loose room by room, what is in hand, and where each box is going.
 * Full is a person's note and does not close a box; a full, open box is the
 * next thing to close.
 */
import { deepContents, isLocationWithin, locationPath } from '../foundation';

import type { ItemRowModel, LocationModel, PlacementWorld } from '../foundation';

/** Where a box is in packing. */
export type BoxStage = 'packing' | 'full' | 'closed';

/** Stages in the order a box moves through them. */
export const BOX_STAGES: readonly BoxStage[] = ['packing', 'full', 'closed'];

/** One box as moving day reads it. */
export interface BoxSummary {
  box: ItemRowModel;
  stage: BoxStage;
  /** Active things inside, nested boxes' contents included. */
  count: number;
  destinationId: string | null;
}

/** What is still loose in one room of the house. */
export interface RoomLoose {
  room: LocationModel;
  items: ItemRowModel[];
}

/** The whole move at a glance. */
export interface MovingSummary {
  boxes: BoxSummary[];
  stages: Readonly<Record<BoxStage, number>>;
  /** Things inside a box. */
  packed: number;
  loose: RoomLoose[];
  looseCount: number;
  inHand: ItemRowModel[];
  /** Closed boxes with no label code: they cannot be found by scanning. */
  unlabelledClosed: number;
}

/** A container's stage. */
export function boxStage(box: ItemRowModel): BoxStage {
  if (box.container === null || box.container.access === 'closed') return 'closed';
  return box.container.full ? 'full' : 'packing';
}

const activeThing = (entry: ItemRowModel): boolean =>
  entry.lifecycle === 'active' && entry.container === null;

/** The room a place belongs to: the ancestor directly under the home, or the home itself. */
export function roomOf(
  world: PlacementWorld,
  homeId: string,
  placeId: string
): LocationModel | null {
  const path = locationPath(world, placeId);
  const homeAt = path.findIndex((node) => node.id === homeId);
  if (homeAt < 0) return null;
  return path[homeAt + 1] ?? path[homeAt] ?? null;
}

function looseByRoom(world: PlacementWorld, homeId: string): RoomLoose[] {
  const rooms = new Map<string, RoomLoose>();
  for (const entry of world.items.values()) {
    if (!activeThing(entry) || entry.placement.kind !== 'location') continue;
    const room = roomOf(world, homeId, entry.placement.locationId);
    if (room === null) continue;
    const group = rooms.get(room.id) ?? { room, items: [] };
    group.items.push(entry);
    rooms.set(room.id, group);
  }
  const order = [...world.locations.keys()];
  return [...rooms.values()]
    .map((group) => ({
      ...group,
      items: group.items.toSorted((a, b) => a.name.localeCompare(b.name)),
    }))
    .toSorted((a, b) => order.indexOf(a.room.id) - order.indexOf(b.room.id));
}

/** Summarises the move out of `homeId`. */
export function summariseMove(
  world: PlacementWorld,
  homeId: string,
  destinations: ReadonlyMap<string, string | null>
): MovingSummary {
  const all = [...world.items.values()];
  const boxes = all
    .filter((entry) => entry.container !== null && entry.lifecycle === 'active')
    .map((box) => ({
      box,
      stage: boxStage(box),
      count: deepContents(world, box.id).filter((inside) => inside.lifecycle === 'active').length,
      destinationId: destinations.get(box.id) ?? null,
    }));
  const loose = looseByRoom(world, homeId);
  const stages = { packing: 0, full: 0, closed: 0 };
  for (const summary of boxes) stages[summary.stage] += 1;
  return {
    boxes,
    stages,
    packed: all.filter((entry) => activeThing(entry) && entry.placement.kind === 'container')
      .length,
    loose,
    looseCount: loose.reduce((sum, group) => sum + group.items.length, 0),
    inHand: all.filter((entry) => activeThing(entry) && entry.placement.kind === 'in-hand'),
    unlabelledClosed: boxes.filter((entry) => entry.stage === 'closed' && entry.box.code === null)
      .length,
  };
}

/** Share of things packed, 0 to 100, rounded down so 100 means truly everything. */
export function packedPercent(summary: MovingSummary): number {
  const total = summary.packed + summary.looseCount + summary.inHand.length;
  return total === 0 ? 0 : Math.floor((summary.packed * 100) / total);
}

/** Whether packing is finished: every box closed and nothing loose in the house. */
export function isMoveDone(summary: MovingSummary): boolean {
  return (
    summary.boxes.length > 0 &&
    summary.looseCount === 0 &&
    summary.stages.closed === summary.boxes.length
  );
}

/** Boxes grouped by stage, stage order, each group in name order. Empty stages are kept. */
export function boxesByStage(
  boxes: readonly BoxSummary[]
): { stage: BoxStage; boxes: BoxSummary[] }[] {
  return BOX_STAGES.map((stage) => ({
    stage,
    boxes: boxes
      .filter((entry) => entry.stage === stage)
      .toSorted((a, b) => a.box.name.localeCompare(b.box.name, undefined, { numeric: true })),
  }));
}

/** One destination's boxes, with how many are already there. */
export interface DestinationGroup {
  destination: LocationModel | null;
  boxes: BoxSummary[];
  closed: number;
  arrived: number;
}

/** Boxes grouped by where they are going, in tree order; undecided last. */
export function boxesByDestination(
  world: PlacementWorld,
  boxes: readonly BoxSummary[]
): DestinationGroup[] {
  const ids = [...new Set(boxes.map((entry) => entry.destinationId))];
  const order = [...world.locations.keys()];
  const rank = (id: string | null): number => (id === null ? Infinity : order.indexOf(id));
  return ids
    .toSorted((a, b) => rank(a) - rank(b))
    .map((id) => {
      const group = boxes.filter((entry) => entry.destinationId === id);
      return {
        destination: id === null ? null : (world.locations.get(id) ?? null),
        boxes: group.toSorted((a, b) =>
          a.box.name.localeCompare(b.box.name, undefined, { numeric: true })
        ),
        closed: group.filter((entry) => entry.stage === 'closed').length,
        arrived: group.filter((entry) => arrivedAt(world, entry.box, id)).length,
      };
    });
}

function arrivedAt(
  world: PlacementWorld,
  box: ItemRowModel,
  destinationId: string | null
): boolean {
  if (destinationId === null || box.placement.kind !== 'location') return false;
  return isLocationWithin(world, box.placement.locationId, destinationId);
}
