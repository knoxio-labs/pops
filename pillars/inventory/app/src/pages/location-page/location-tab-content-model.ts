import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** The item operations and disabled state used by location contents rows. */
export interface ContentsVerbs {
  readonly pendingIds: ReadonlySet<string>;
  readonly rejections: Readonly<Record<string, string>>;
  readonly disabledReason?: string;
  pickUp: (ids: readonly string[]) => void;
  startMove: (ids: readonly string[]) => void;
  takeOut: (ids: readonly string[]) => void;
}

/** One box and the rows directly inside it. */
export interface BoxGroup {
  readonly box: ItemRowModel;
  readonly depth: number;
  readonly contents: readonly ItemRowModel[];
}

/** The three unfiltered lists rendered by a location page tab. */
export interface PlaceContents {
  readonly places: readonly LocationModel[];
  readonly here: readonly ItemRowModel[];
  readonly boxes: readonly BoxGroup[];
  readonly boxedCount: number;
}

const byName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name, undefined, { numeric: true });

function itemMatches(query: string, item: ItemRowModel): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    item.name.toLowerCase().includes(needle) ||
    item.code?.toLowerCase().includes(needle) === true
  );
}

function placeMatches(query: string, place: LocationModel): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || place.name.toLowerCase().includes(needle);
}

/** Returns the selectable item ids for the current location tab. */
export function visibleRowIds(contents: PlaceContents, tab: 'items' | 'in-boxes'): string[] {
  if (tab === 'items') return contents.here.map((entry) => entry.id);
  return contents.boxes.flatMap((group) => group.contents.map((entry) => entry.id));
}

function boxesFirst(entries: readonly ItemRowModel[]): ItemRowModel[] {
  const boxes = entries.filter((entry) => entry.container !== null).toSorted(byName);
  return [...boxes, ...entries.filter((entry) => entry.container === null).toSorted(byName)];
}

function directContents(world: PlacementWorld, containerId: string): ItemRowModel[] {
  return [...world.items.values()]
    .filter(
      (item) => item.placement.kind === 'container' && item.placement.containerId === containerId
    )
    .toSorted(byName);
}

function groupsFor(
  world: PlacementWorld,
  box: ItemRowModel,
  options: { depth: number; query: string; ancestors?: ReadonlySet<string> }
): BoxGroup[] {
  const ancestors = options.ancestors ?? new Set<string>();
  if (ancestors.has(box.id)) return [];
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(box.id);
  const contents = boxesFirst(
    directContents(world, box.id).filter((item) => itemMatches(options.query, item))
  );
  return [
    { box, depth: options.depth, contents },
    ...contents
      .filter((item) => item.container !== null)
      .flatMap((item) =>
        groupsFor(world, item, {
          depth: options.depth + 1,
          query: options.query,
          ancestors: nextAncestors,
        })
      ),
  ];
}

function allPlaceContents(world: PlacementWorld, placeId: string): PlaceContents {
  const here = boxesFirst(
    [...world.items.values()].filter(
      (item) =>
        item.lifecycle === 'active' &&
        item.placement.kind === 'location' &&
        item.placement.locationId === placeId
    )
  );
  const boxes = here
    .filter((item) => item.container !== null)
    .flatMap((box) => groupsFor(world, box, { depth: 0, query: '' }));
  return {
    places: [...world.locations.values()]
      .filter((location) => location.parentId === placeId)
      .toSorted(byName),
    here,
    boxes,
    boxedCount: boxes.reduce((sum, group) => sum + group.contents.length, 0),
  };
}

/** Derives the three filtered lists shown by a location page tab. */
export function filterContents(contents: PlaceContents, query: string): PlaceContents {
  const needle = query.trim();
  if (needle === '') return contents;
  const boxes = contents.boxes.flatMap((group) => {
    if (itemMatches(needle, group.box)) return [group];
    const matching = group.contents.filter((item) => itemMatches(needle, item));
    return matching.length === 0 ? [] : [{ ...group, contents: matching }];
  });
  return {
    places: contents.places.filter((place) => placeMatches(needle, place)),
    here: contents.here.filter((item) => itemMatches(needle, item)),
    boxes,
    boxedCount: boxes.reduce((sum, group) => sum + group.contents.length, 0),
  };
}

/** Builds the location contents model from the page's placement world. */
export function placeContents(world: PlacementWorld, placeId: string): PlaceContents {
  return allPlaceContents(world, placeId);
}
