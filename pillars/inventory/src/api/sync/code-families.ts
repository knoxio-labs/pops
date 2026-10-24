import { isNull } from 'drizzle-orm';

import { resolvePublishedType } from '../../catalogue/index.js';
import { items, locations } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** A code split into its family stem and trailing number, e.g. `BOX-OFFICE-` and `4`. */
export const FAMILY_CODE = /^(.*?[^\d])(\d+)$/;

/** What family inference reads from a suggestion request. */
export interface FamilyRequest {
  readonly typeKey?: string;
  readonly locationId?: string;
  readonly containerId?: string;
}

interface PlacedItem {
  readonly id: string;
  readonly code: string | null;
  readonly typeId: string | null;
  readonly locationId: string | null;
  readonly containingItemId: string | null;
}

interface FamilyRank {
  readonly stem: string;
  readonly inContainer: number;
  readonly sharedDepth: number;
  readonly members: number;
}

function ancestorChain(db: CommandDb): (id: string | null) => string[] {
  const parents = new Map(
    db
      .select({ id: locations.id, parentId: locations.parentId })
      .from(locations)
      .where(isNull(locations.deletedAt))
      .all()
      .map((row) => [row.id, row.parentId])
  );
  return (id) => {
    const chain: string[] = [];
    let cursor = id;
    while (cursor !== null && parents.has(cursor) && !chain.includes(cursor)) {
      chain.unshift(cursor);
      cursor = parents.get(cursor) ?? null;
    }
    return chain;
  };
}

function effectiveLocation(
  item: PlacedItem | undefined,
  byId: Map<string, PlacedItem>
): string | null {
  const seen = new Set<string>();
  let cursor = item;
  while (cursor !== undefined && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.containingItemId === null) return cursor.locationId;
    cursor = byId.get(cursor.containingItemId);
  }
  return null;
}

function sharedPrefix(a: readonly string[], b: readonly string[]): number {
  let depth = 0;
  while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1;
  return depth;
}

function compareFamilies(a: FamilyRank, b: FamilyRank): number {
  return (
    b.inContainer - a.inContainer ||
    b.sharedDepth - a.sharedDepth ||
    b.members - a.members ||
    a.stem.localeCompare(b.stem)
  );
}

interface FamilyTally extends FamilyRank {
  readonly highest: number;
}

interface Placement {
  readonly byId: Map<string, PlacedItem>;
  readonly chainOf: (id: string | null) => string[];
  readonly containerId: string | undefined;
  readonly destination: readonly string[];
}

function liveItems(db: CommandDb): PlacedItem[] {
  return db
    .select({
      id: items.id,
      code: items.code,
      typeId: items.typeId,
      locationId: items.locationId,
      containingItemId: items.containingItemId,
    })
    .from(items)
    .where(isNull(items.deletedAt))
    .all();
}

function placementFor(db: CommandDb, live: PlacedItem[], request: FamilyRequest): Placement {
  const byId = new Map(live.map((row) => [row.id, row]));
  const chainOf = ancestorChain(db);
  const container = request.containerId === undefined ? undefined : byId.get(request.containerId);
  const destinationId =
    container === undefined ? (request.locationId ?? null) : effectiveLocation(container, byId);
  return { byId, chainOf, containerId: container?.id, destination: chainOf(destinationId) };
}

interface Member {
  readonly row: PlacedItem;
  readonly stem: string;
  readonly number: number;
}

function tally(previous: FamilyTally | undefined, member: Member, place: Placement): FamilyTally {
  const { row, stem, number } = member;
  const inContainer = place.containerId !== undefined && row.containingItemId === place.containerId;
  const depth = sharedPrefix(place.destination, place.chainOf(effectiveLocation(row, place.byId)));
  if (previous === undefined) {
    return {
      stem,
      highest: number,
      inContainer: inContainer ? 1 : 0,
      sharedDepth: depth,
      members: 1,
    };
  }
  return {
    stem: number >= previous.highest ? stem : previous.stem,
    highest: Math.max(number, previous.highest),
    inContainer: previous.inContainer + (inContainer ? 1 : 0),
    sharedDepth: Math.max(previous.sharedDepth, depth),
    members: previous.members + 1,
  };
}

/**
 * The code families live items of the requested type already use, best first.
 * A family is the stem of a code ending in a number (`BOX-OFFICE-` for
 * `BOX-OFFICE-4`), compared case-insensitively and reported in the spelling of
 * its highest-numbered member. Families are ranked by members inside the
 * destination container, then by the deepest location the destination shares
 * with any member, then by size, then alphabetically. An untyped request, or
 * one whose type is not published, has no families.
 */
export function rankCodeFamilies(db: CommandDb, request: FamilyRequest): string[] {
  if (request.typeKey === undefined) return [];
  const type = resolvePublishedType(db, { key: request.typeKey });
  if (type === null) return [];

  const live = liveItems(db);
  const place = placementFor(db, live, request);
  const families = new Map<string, FamilyTally>();
  for (const row of live) {
    if (row.typeId !== type.id || row.code === null) continue;
    const match = FAMILY_CODE.exec(row.code);
    const stem = match?.[1];
    const digits = match?.[2];
    if (stem === undefined || digits === undefined) continue;
    const key = stem.toLowerCase();
    families.set(
      key,
      tally(families.get(key), { row, stem, number: Number.parseInt(digits, 10) }, place)
    );
  }
  return [...families.values()].toSorted(compareFamilies).map((family) => family.stem);
}
