import { and, eq, isNull } from 'drizzle-orm';

import { WebLocationTalliesResponseSchema } from '../../contract/rest-web-locations.js';
import { items, locations } from '../../db/index.js';
import { readEffectiveLocations } from './placement-scope.js';

import type { z } from 'zod';

import type { WebLocationTallySchema } from '../../contract/rest-web-locations.js';
import type { CommandDb } from '../../domain/commands/index.js';

/** The response returned by `GET /web/locations/tallies`. */
export type WebLocationTallies = z.infer<typeof WebLocationTalliesResponseSchema>;

type WebLocationTally = z.infer<typeof WebLocationTallySchema>;

interface LiveLocation {
  id: string;
  parentId: string | null;
}

function emptyTally(): WebLocationTally {
  return { places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 };
}

function readLiveLocations(db: CommandDb): LiveLocation[] {
  return db
    .select({ id: locations.id, parentId: locations.parentId })
    .from(locations)
    .where(isNull(locations.deletedAt))
    .all();
}

function addDirectCounts(
  tallies: Map<string, WebLocationTally>,
  activeItems: readonly (typeof items.$inferSelect)[]
): void {
  for (const item of activeItems) {
    if (item.placementKind !== 'location' || item.locationId === null) continue;

    const tally = tallies.get(item.locationId);
    if (!tally) continue;

    if (item.isContainer === 1) tally.boxesHere += 1;
    else tally.itemsHere += 1;
  }
}

function addEffectiveCounts(
  tallies: Map<string, WebLocationTally>,
  parentById: ReadonlyMap<string, string | null>,
  activeItems: readonly (typeof items.$inferSelect)[],
  effectiveLocations: ReadonlyMap<string, string | null>
): void {
  for (const item of activeItems) {
    const effectiveLocation = effectiveLocations.get(item.id);
    if (effectiveLocation === undefined || effectiveLocation === null) continue;

    const exactTally = tallies.get(effectiveLocation);
    if (!exactTally) continue;
    if (item.placementKind === 'container') exactTally.inBoxes += 1;

    const visited = new Set<string>();
    let currentLocation: string | null = effectiveLocation;
    while (currentLocation !== null && !visited.has(currentLocation)) {
      visited.add(currentLocation);
      const tally = tallies.get(currentLocation);
      if (!tally) break;

      tally.total += 1;
      currentLocation = parentById.get(currentLocation) ?? null;
    }
  }
}

/** Reads zero-inclusive tallies for every live place using effective placement for boxed items. */
export function readLocationTallies(db: CommandDb): WebLocationTallies {
  const liveLocations = readLiveLocations(db);
  const tallies = new Map(liveLocations.map((location) => [location.id, emptyTally()]));
  const parentById = new Map(liveLocations.map((location) => [location.id, location.parentId]));

  for (const location of liveLocations) {
    if (location.parentId === null) continue;
    const parentTally = tallies.get(location.parentId);
    if (parentTally) parentTally.places += 1;
  }

  const activeItems = db
    .select()
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.lifecycle, 'active')))
    .all();
  const effectiveLocations = readEffectiveLocations(
    db,
    activeItems.map((item) => item.id)
  );

  addDirectCounts(tallies, activeItems);
  addEffectiveCounts(tallies, parentById, activeItems, effectiveLocations);

  return WebLocationTalliesResponseSchema.parse({ tallies: Object.fromEntries(tallies) });
}
