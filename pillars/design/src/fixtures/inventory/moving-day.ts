/**
 * The move-out world: the Wattle Street house mid-pack (16 boxes, some open,
 * some full, some closed, two without a label), what is still loose in each
 * room, what is in hand, and the two places boxes are going. A second world
 * is the same move finished, for the done state.
 */

import { buildWorld } from '@/kit/inventory/foundation';

import { at, box, inBox, inHand, item } from './core-factory';
import { coreLocations } from './core-locations';
import { BOX_LINES, IN_HAND_LINE, LOOSE_LINES, PARENTS, STORAGE } from './moving-day-spec';

import type {
  ItemRowModel,
  LocationModel,
  Placement,
  PlacementWorld,
} from '@/kit/inventory/foundation';

/** The property being packed up. */
export const MOVING_HOME_ID = 'loc-house';

const destinationPlaces: readonly LocationModel[] = [
  { id: PARENTS, name: "Parents' house", parentId: null, kind: 'property' },
  { id: 'loc-parents-shed', name: 'Back shed', parentId: PARENTS, kind: 'area' },
];

const movingLocations: readonly LocationModel[] = [...coreLocations, ...destinationPlaces];

const DESTINATIONS: Readonly<Record<string, string | null>> = {
  storage: STORAGE,
  parents: PARENTS,
  '-': null,
};

function things(line: string, idPrefix: string, placement: Placement): ItemRowModel[] {
  return line.split(', ').map((entry, index) => {
    const [name = entry, quantity] = entry.split(' ×');
    return item([`${idPrefix}-${index}`, name, null], placement, {
      quantity: quantity === undefined ? 1 : Number(quantity),
    });
  });
}

interface ParsedBox {
  box: ItemRowModel;
  contents: ItemRowModel[];
  destinationId: string | null;
}

function parseBox(line: string): ParsedBox {
  const [id = '', name = '', place = '', access = '', code = '-', going = '-', contents = ''] =
    line.split(' | ');
  const container = box(
    [id, name, 'type-box'],
    at(place),
    access.startsWith('open') ? 'open' : 'closed',
    {
      full: access.endsWith('full'),
      code: code === '-' ? null : code,
    }
  );
  return {
    box: container,
    contents: things(contents, id, inBox(id)),
    destinationId: DESTINATIONS[going] ?? null,
  };
}

const parsedBoxes = BOX_LINES.map(parseBox);

const looseThings: readonly ItemRowModel[] = LOOSE_LINES.flatMap((line) => {
  const [place = '', list = ''] = line.split(' | ');
  return things(list, `mv-loose-${place}`, at(place));
});

const inHandThings: readonly ItemRowModel[] = things(IN_HAND_LINE, 'mv-hand', inHand);

/** Where each box is going, by box id. Null: not decided yet. */
export const movingDestinations: ReadonlyMap<string, string | null> = new Map(
  parsedBoxes.map((entry) => [entry.box.id, entry.destinationId])
);

/** Every thing in the move world. */
export const movingInventory: readonly ItemRowModel[] = [
  ...parsedBoxes.flatMap((entry) => [entry.box, ...entry.contents]),
  ...looseThings,
  ...inHandThings,
];

/** The move, mid-pack. */
export const movingWorld: PlacementWorld = buildWorld(movingInventory, movingLocations);

function packedInto(entry: ItemRowModel, boxes: readonly ParsedBox[]): ItemRowModel {
  if (entry.placement.kind !== 'location') return entry;
  const { locationId } = entry.placement;
  const room = coreLocations.find((node) => node.id === locationId);
  const target =
    boxes.find(
      (candidate) =>
        candidate.box.placement.kind === 'location' &&
        (candidate.box.placement.locationId === locationId ||
          candidate.box.placement.locationId === room?.parentId)
    ) ?? boxes[0];
  return target ? { ...entry, placement: inBox(target.box.id) } : entry;
}

function finished(): readonly ItemRowModel[] {
  const closed = movingInventory.map((entry) =>
    entry.container ? { ...entry, container: { access: 'closed' as const, full: true } } : entry
  );
  return closed.map((entry) =>
    entry.container === null && entry.placement.kind === 'location'
      ? packedInto(entry, parsedBoxes)
      : entry
  );
}

/** The same move with every box closed and nothing left loose. Two boxes still lack a label. */
export const movingDoneWorld: PlacementWorld = buildWorld(finished(), movingLocations);

/** A house with no boxes yet: the move has not started. */
export const movingNotStartedWorld: PlacementWorld = buildWorld(
  [...looseThings, ...inHandThings],
  movingLocations
);
