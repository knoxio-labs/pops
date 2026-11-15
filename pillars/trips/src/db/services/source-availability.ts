import { and, eq, isNull } from 'drizzle-orm';

import { events, journeys, rentals, stays, trips, visits } from '../schema.js';

import type { DocumentTargetKind } from '../../contract/document-associations.js';
import type { ResponsibilityTargetKind } from '../../contract/responsibilities.js';
import type { TripsDb } from '../index.js';

function sourceTable(
  kind: Exclude<DocumentTargetKind | ResponsibilityTargetKind, 'trip'>
): typeof visits | typeof journeys | typeof stays | typeof events | typeof rentals {
  switch (kind) {
    case 'visit':
      return visits;
    case 'journey':
      return journeys;
    case 'stay':
      return stays;
    case 'event':
      return events;
    case 'rental':
      return rentals;
  }
}

/** Resolve live association targets without removing retained relation history or accepting foreign identities. */
export function isSourceTargetLive(
  db: TripsDb,
  tripId: number,
  kind: DocumentTargetKind | ResponsibilityTargetKind,
  id: number
): boolean {
  if (kind === 'trip')
    return (
      id === tripId &&
      db.select({ id: trips.id }).from(trips).where(eq(trips.id, id)).get() !== undefined
    );
  const table = sourceTable(kind);
  return (
    db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.tripId, tripId), eq(table.id, id), isNull(table.removedAt)))
      .get() !== undefined
  );
}
