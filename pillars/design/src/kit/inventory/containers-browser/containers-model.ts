/**
 * The Containers browser's segments (All, Open, Closed, Full, Retired and
 * Moving) as pure functions over rows: which containers each shows, the
 * count on each segment, what a container holds, and the packing progress
 * the Moving segment leads with.
 */
import { deepContents, directContents } from '../foundation';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** A segment of the Containers browser. */
export type ContainerSegment = 'all' | 'open' | 'closed' | 'full' | 'retired' | 'moving';

/** Segments in the order the control draws them. */
export const SEGMENTS: readonly ContainerSegment[] = [
  'all',
  'open',
  'closed',
  'full',
  'moving',
  'retired',
];

/** Whether a row is a container at all. */
export function isContainer(item: ItemRowModel): boolean {
  return item.container !== null;
}

/**
 * Whether a container belongs in a segment. Every segment but Retired shows
 * active containers only; Full is a flag a person sets, so a full box can
 * also be open or closed.
 */
export function inSegment(item: ItemRowModel, segment: ContainerSegment): boolean {
  const facts = item.container;
  if (facts === null) return false;
  if (segment === 'retired') return item.lifecycle === 'retired';
  if (item.lifecycle !== 'active') return false;
  if (segment === 'open') return facts.access === 'open';
  if (segment === 'closed') return facts.access === 'closed';
  if (segment === 'full') return facts.full;
  return true;
}

/** The count each segment's label carries. */
export function segmentCounts(
  items: readonly ItemRowModel[]
): Readonly<Record<ContainerSegment, number>> {
  const count = (segment: ContainerSegment) =>
    items.filter((item) => inSegment(item, segment)).length;
  return {
    all: count('all'),
    open: count('open'),
    closed: count('closed'),
    full: count('full'),
    retired: count('retired'),
    moving: count('moving'),
  };
}

/** What a container holds: directly, and all the way down through nested boxes. */
export function holds(world: PlacementWorld, id: string): { direct: number; deep: number } {
  return { direct: directContents(world, id).length, deep: deepContents(world, id).length };
}

/** How far packing has got, over the active containers. */
export interface PackingProgress {
  closed: number;
  fullButOpen: number;
  open: number;
  packedItems: number;
}

/** Packing progress over a set of rows. */
export function packingProgress(
  world: PlacementWorld,
  items: readonly ItemRowModel[]
): PackingProgress {
  const active = items.filter((item) => inSegment(item, 'moving'));
  const closed = active.filter((item) => item.container?.access === 'closed');
  const open = active.filter((item) => item.container?.access === 'open');
  const packed = new Set(
    active.flatMap((item) => directContents(world, item.id)).map((inside) => inside.id)
  );
  return {
    closed: closed.length,
    fullButOpen: open.filter((item) => item.container?.full === true).length,
    open: open.filter((item) => item.container?.full !== true).length,
    packedItems: packed.size,
  };
}

function packingRank(item: ItemRowModel): number {
  if (item.container?.access === 'closed') return 2;
  return item.container?.full === true ? 1 : 0;
}

/** Moving order: still open first, then full but open, then closed; by name within each. */
export function movingOrder(a: ItemRowModel, b: ItemRowModel): number {
  return packingRank(a) - packingRank(b) || a.name.localeCompare(b.name);
}
