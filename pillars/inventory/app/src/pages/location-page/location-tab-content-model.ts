import {
  filterContents as filterSharedContents,
  placeContents as buildSharedContents,
  type BoxGroup as SharedBoxGroup,
  type PlaceContents as SharedPlaceContents,
} from '../../foundation/places/contents-model.js';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** The item operations and disabled state used by location contents rows. */
export interface ContentsVerbs {
  readonly pendingIds: ReadonlySet<string>;
  readonly rejections: Readonly<Record<string, string>>;
  readonly disabledReason?: string;
  readonly drag?: DragPlacementApi;
  pickUp: (ids: readonly string[]) => void;
  startMove: (ids: readonly string[]) => void;
  takeOut: (ids: readonly string[]) => void;
}

/** One box and the rows directly inside it. */
export type BoxGroup = SharedBoxGroup;

/** The three unfiltered lists rendered by a location page tab. */
export type PlaceContents = SharedPlaceContents;

/** Returns the selectable item ids for the current location tab. */
export function visibleRowIds(contents: PlaceContents, tab: 'items' | 'in-boxes'): string[] {
  if (tab === 'items') return contents.here.map((entry) => entry.id);
  return contents.boxes.flatMap((group) => group.contents.map((entry) => entry.id));
}

/** Derives the three filtered lists shown by a location page tab. */
export function filterContents(contents: PlaceContents, query: string): PlaceContents {
  return filterSharedContents(contents, query);
}

/** Builds the location contents model from the page's placement world. */
export function placeContents(world: PlacementWorld, placeId: string): PlaceContents {
  return buildSharedContents(world, placeId);
}
