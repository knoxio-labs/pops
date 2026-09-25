/**
 * What one place holds, in the three lists its page shows: the places
 * inside it, the things sitting directly in it (boxes included), and what
 * is inside those boxes, box by box with nested boxes after their parent.
 * Inactive things are left out unless asked for.
 */
import { directContents } from '../foundation';
import { childPlaces } from '../locations-tree/tree-model';

import type { ItemRowModel, LocationModel, PlacementWorld } from '../foundation';

/** One box sitting here (or inside one that is), and what is directly in it. */
export interface BoxGroup {
  box: ItemRowModel;
  /** 0 for a box sitting in the place, 1 for a box inside that box, and so on. */
  depth: number;
  contents: ItemRowModel[];
}

/** The page's three lists. */
export interface PlaceContents {
  places: LocationModel[];
  /** Boxes first, then loose things, each in name order. */
  here: ItemRowModel[];
  boxes: BoxGroup[];
  /** Everything listed across `boxes`, nested boxes counted once as a thing. */
  boxedCount: number;
}

const byName = (a: ItemRowModel, b: ItemRowModel): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

function boxesFirst(entries: readonly ItemRowModel[]): ItemRowModel[] {
  const boxes = entries.filter((entry) => entry.container !== null).toSorted(byName);
  return [...boxes, ...entries.filter((entry) => entry.container === null).toSorted(byName)];
}

function groupsFor(
  world: PlacementWorld,
  box: ItemRowModel,
  depth: number,
  keep: (entry: ItemRowModel) => boolean
): BoxGroup[] {
  const contents = boxesFirst(directContents(world, box.id).filter(keep));
  const nested = contents.filter((entry) => entry.container !== null);
  return [
    { box, depth, contents },
    ...nested.flatMap((inner) => groupsFor(world, inner, depth + 1, keep)),
  ];
}

/** The three lists for `placeId`. */
export function placeContents(
  world: PlacementWorld,
  placeId: string,
  includeInactive = false
): PlaceContents {
  const keep = (entry: ItemRowModel): boolean => includeInactive || entry.lifecycle === 'active';
  const here = boxesFirst(
    [...world.items.values()].filter(
      (entry) =>
        keep(entry) && entry.placement.kind === 'location' && entry.placement.locationId === placeId
    )
  );
  const boxes = here
    .filter((entry) => entry.container !== null)
    .flatMap((box) => groupsFor(world, box, 0, keep));
  return {
    places: childPlaces(world, placeId),
    here,
    boxes,
    boxedCount: boxes.reduce((sum, group) => sum + group.contents.length, 0),
  };
}

function hit(query: string, ...fields: (string | null)[]): boolean {
  return fields.some((field) => field !== null && field.toLowerCase().includes(query));
}

/**
 * Narrows all three lists to `query` (name or code, any case). A box whose
 * own name matches keeps everything in it; otherwise it stays only when
 * something inside it matches.
 */
export function filterContents(contents: PlaceContents, query: string): PlaceContents {
  const needle = query.trim().toLowerCase();
  if (needle === '') return contents;
  const boxes = contents.boxes.flatMap((group) => {
    if (hit(needle, group.box.name, group.box.code)) return [group];
    const kept = group.contents.filter((entry) => hit(needle, entry.name, entry.code));
    return kept.length === 0 ? [] : [{ ...group, contents: kept }];
  });
  return {
    places: contents.places.filter((node) => hit(needle, node.name)),
    here: contents.here.filter((entry) => hit(needle, entry.name, entry.code)),
    boxes,
    boxedCount: boxes.reduce((sum, group) => sum + group.contents.length, 0),
  };
}

/** Whether nothing at all is in the place. */
export function isEmptyContents(contents: PlaceContents): boolean {
  return contents.places.length === 0 && contents.here.length === 0;
}
