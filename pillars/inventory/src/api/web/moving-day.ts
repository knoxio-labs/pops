import { and, eq, isNull } from 'drizzle-orm';

import { items, locations } from '../../db/index.js';
import { readPlacement } from '../../domain/commands/item-fields.js';
import { ValidationError } from '../shared/errors.js';
import { readMovingDestinations } from './moving-day-destination.js';
import { readLocationOrder } from './moving-day-location-order.js';
import { insideContainerSql, readRooms } from './placement-scope.js';

import type { z } from 'zod';

import type { WebMovingResponseSchema } from '../../contract/rest-web-moving.js';
import type { ItemRow } from '../../db/row-types.js';
import type { CommandDb } from '../../domain/commands/index.js';

type WebMovingResponse = z.infer<typeof WebMovingResponseSchema>;
type MovingBox = WebMovingResponse['boxes'][number];
type Thing = WebMovingResponse['inHand'][number];
type LooseGroup = WebMovingResponse['loose'][number];

function compareNames(
  left: { name: string; id: string },
  right: { name: string; id: string }
): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareBoxes(
  left: { name: string; id: string },
  right: { name: string; id: string }
): number {
  return (
    left.name.localeCompare(right.name, undefined, { numeric: true }) ||
    left.id.localeCompare(right.id)
  );
}

function isLive(row: ItemRow): boolean {
  return row.deletedAt === null && row.lifecycle === 'active';
}

function isThing(row: ItemRow): boolean {
  return isLive(row) && row.isContainer === 0;
}

function boxStage(row: ItemRow): MovingBox['stage'] {
  if (row.access === 'closed') return 'closed';
  return row.isFull === 1 ? 'full' : 'packing';
}

function thing(row: ItemRow): Thing {
  return { id: row.id, name: row.name, code: row.code };
}

function liveDescendants(db: CommandDb, boxId: string): ItemRow[] {
  const descendants = db.select().from(items).where(insideContainerSql(boxId)).all();
  const childrenByContainer = new Map<string, ItemRow[]>();
  for (const row of descendants) {
    if (row.containingItemId === null) continue;
    const children = childrenByContainer.get(row.containingItemId);
    if (children) children.push(row);
    else childrenByContainer.set(row.containingItemId, [row]);
  }
  for (const [containerId, children] of childrenByContainer) {
    childrenByContainer.set(containerId, children.toSorted(compareNames));
  }

  const result: ItemRow[] = [];
  const seen = new Set<string>();
  const walk = (containerId: string): void => {
    for (const child of childrenByContainer.get(containerId) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (isLive(child)) result.push(child);
      if (child.isContainer === 1) walk(child.id);
    }
  };
  walk(boxId);
  return result;
}

function looseGroups(
  db: CommandDb,
  looseThings: readonly ItemRow[],
  homeLocationId: string | undefined
): LooseGroup[] {
  const liveLocationIds = new Set(
    db
      .select({ id: locations.id })
      .from(locations)
      .where(isNull(locations.deletedAt))
      .all()
      .map((row) => row.id)
  );
  const locatedThings = looseThings.filter(
    (row) => row.locationId !== null && liveLocationIds.has(row.locationId)
  );
  const locationIds = locatedThings.flatMap((row) =>
    row.locationId === null ? [] : [row.locationId]
  );
  const rooms = readRooms(db, locationIds, homeLocationId);
  const grouped = new Map<string, LooseGroup>();
  for (const row of locatedThings) {
    if (row.locationId === null) continue;
    const room = rooms.get(row.locationId);
    if (!room || !liveLocationIds.has(room.id)) continue;
    const group = grouped.get(room.id);
    if (group) group.items.push(thing(row));
    else grouped.set(room.id, { room, items: [thing(row)] });
  }
  for (const group of grouped.values()) {
    group.items = group.items.toSorted(compareNames);
  }
  const rank = new Map(readLocationOrder(db).map((id, index) => [id, index]));
  return [...grouped.values()].toSorted(
    (left, right) =>
      (rank.get(left.room.id) ?? Number.POSITIVE_INFINITY) -
        (rank.get(right.room.id) ?? Number.POSITIVE_INFINITY) || compareNames(left.room, right.room)
  );
}

/**
 * Reads the complete moving-day aggregate from the caller's inventory snapshot.
 * Only non-tombstoned active rows contribute to boxes, contents, loose items,
 * and in-hand items; an optional home location scopes loose rooms.
 */
export function readMovingDay(
  db: CommandDb,
  query: { destinationField: string; homeLocationId?: string }
): z.infer<typeof WebMovingResponseSchema> {
  if (query.homeLocationId !== undefined) {
    const home = db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, query.homeLocationId), isNull(locations.deletedAt)))
      .get();
    if (!home) throw new ValidationError(`home location '${query.homeLocationId}' not found`);
  }

  const liveRows = db
    .select()
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.lifecycle, 'active')))
    .all();
  const boxRows = liveRows.filter((row) => row.isContainer === 1).toSorted(compareBoxes);
  const destination = readMovingDestinations(db, boxRows, query.destinationField);
  const stages = { packing: 0, full: 0, closed: 0 };
  const boxes: MovingBox[] = boxRows.map((box) => {
    const contents = liveDescendants(db, box.id).map((row) => ({
      ...thing(row),
      containerId: row.containingItemId ?? box.id,
    }));
    const stage = boxStage(box);
    stages[stage] += 1;
    return {
      id: box.id,
      name: box.name,
      code: box.code,
      stage,
      count: contents.length,
      destination: destination.destinations.get(box.id) ?? null,
      placement: readPlacement(box),
      contents,
    };
  });

  const looseThingsRows = liveRows.filter(
    (row) => row.isContainer === 0 && row.placementKind === 'location'
  );
  const inHandRows = liveRows
    .filter((row) => row.isContainer === 0 && row.placementKind === 'hand')
    .toSorted(compareNames);
  const loose = looseGroups(db, looseThingsRows, query.homeLocationId);

  return {
    boxes,
    stages,
    packed: liveRows.filter((row) => isThing(row) && row.placementKind === 'container').length,
    loose,
    looseCount: loose.reduce((total, group) => total + group.items.length, 0),
    inHand: inHandRows.map(thing),
    unlabelledClosed: boxes.filter((box) => box.stage === 'closed' && box.code === null).length,
    destinationOptions: destination.options,
  };
}
