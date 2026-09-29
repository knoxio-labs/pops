import { directContents } from '../model/placement-model.js';
import { childPlaces } from './tree-model.js';

import type { ItemRowModel, LocationModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** One box in or under a place and the items directly inside it. */
export interface BoxGroup {
  box: ItemRowModel;
  depth: number;
  contents: ItemRowModel[];
}

/** The ordered child places, direct items, and nested box groups for a place. */
export interface PlaceContents {
  places: LocationModel[];
  here: ItemRowModel[];
  boxes: BoxGroup[];
  boxedCount: number;
}

const byName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name, undefined, { numeric: true });

function boxesFirst(entries: readonly ItemRowModel[]): ItemRowModel[] {
  const boxes = entries.filter((entry) => entry.container !== null).toSorted(byName);
  const loose = entries.filter((entry) => entry.container === null).toSorted(byName);
  return [...boxes, ...loose];
}

function matches(query: string, ...fields: (string | null)[]): boolean {
  return fields.some((field) => field !== null && field.toLowerCase().includes(query));
}

interface GroupOptions {
  depth: number;
  keep: (entry: ItemRowModel) => boolean;
  ancestors?: ReadonlySet<string>;
}

interface ContentMatches {
  boxIds: ReadonlySet<string>;
  groupIds: ReadonlySet<string>;
}

function groupsFor(world: PlacementWorld, box: ItemRowModel, options: GroupOptions): BoxGroup[] {
  const { depth, keep, ancestors = new Set() } = options;
  if (ancestors.has(box.id)) return [];
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(box.id);
  const contents = boxesFirst(directContents(world, box.id).filter(keep));
  return [
    { box, depth, contents },
    ...contents
      .filter((entry) => entry.container !== null)
      .flatMap((entry) =>
        groupsFor(world, entry, { depth: depth + 1, keep, ancestors: nextAncestors })
      ),
  ];
}

function parentBoxId(group: BoxGroup): string | null {
  return group.box.placement.kind === 'container' ? group.box.placement.containerId : null;
}

function includeMatchingAncestors(
  groups: readonly BoxGroup[],
  groupByBoxId: ReadonlyMap<string, BoxGroup>,
  matchingGroups: Set<string>
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      const parentId = parentBoxId(group);
      if (
        matchingGroups.has(group.box.id) &&
        parentId !== null &&
        groupByBoxId.has(parentId) &&
        !matchingGroups.has(parentId)
      ) {
        matchingGroups.add(parentId);
        changed = true;
      }
    }
  }
}

function contentMatches(contents: PlaceContents, needle: string): ContentMatches {
  const boxIds = new Set<string>();
  const groupIds = new Set<string>();
  const groupByBoxId = new Map(contents.boxes.map((group) => [group.box.id, group]));

  for (const group of contents.boxes) {
    if (matches(needle, group.box.name, group.box.code)) {
      boxIds.add(group.box.id);
      groupIds.add(group.box.id);
    }
    if (group.contents.some((entry) => matches(needle, entry.name, entry.code))) {
      groupIds.add(group.box.id);
    }
  }

  includeMatchingAncestors(contents.boxes, groupByBoxId, groupIds);
  return { boxIds, groupIds };
}

/** Builds a place's contents, excluding inactive rows unless requested. */
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
    .flatMap((box) => groupsFor(world, box, { depth: 0, keep }));
  return {
    places: childPlaces(world, placeId),
    here,
    boxes,
    boxedCount: boxes.reduce((total, group) => total + group.contents.length, 0),
  };
}

/** Filters names and codes without losing matching box contents. */
export function filterContents(contents: PlaceContents, query: string): PlaceContents {
  const needle = query.trim().toLowerCase();
  if (needle === '') return contents;
  const { boxIds, groupIds } = contentMatches(contents, needle);

  const boxes = contents.boxes.flatMap((group) => {
    if (boxIds.has(group.box.id)) return [group];
    const matching = group.contents.filter(
      (item) => matches(needle, item.name, item.code) || groupIds.has(item.id)
    );
    return matching.length === 0 ? [] : [{ ...group, contents: matching }];
  });
  return {
    places: contents.places.filter((place) => matches(needle, place.name)),
    here: contents.here.filter((item) => matches(needle, item.name, item.code)),
    boxes,
    boxedCount: boxes.reduce((total, group) => total + group.contents.length, 0),
  };
}

/** Returns whether a filtered contents view has no places or direct items. */
export function isEmptyContents(contents: PlaceContents): boolean {
  return contents.places.length === 0 && contents.here.length === 0;
}
