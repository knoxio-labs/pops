import { and, eq } from 'drizzle-orm';

import { events, journeys, journeyLegs, meetingPlans, rentals, stays, visits } from '../schema.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { TripsDb } from '../index.js';
import type { RouteDraftRecord } from './route-draft-records.js';

/** One verified lifecycle transition; callers own the encompassing immediate transaction and guards. */
export type RouteDraftLifecycleChange =
  | { kind: 'remove'; operationId: string }
  | { kind: 'restore' };

/** Advance internal/public numeric guards without accepting unsafe or exhausted values. */
export function nextRouteDraftRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new TripsServiceError('route_draft_conflict');
  }
  return value + 1;
}

function lifecycle(
  row: { removalRevision: number },
  change: RouteDraftLifecycleChange,
  now: string
): {
  removedAt: string | null;
  removalOperationId: string | null;
  removalRevision: number;
  updatedAt: string;
} {
  return {
    removedAt: change.kind === 'remove' ? now : null,
    removalOperationId: change.kind === 'remove' ? change.operationId : null,
    removalRevision: nextRouteDraftRevision(row.removalRevision),
    updatedAt: now,
  };
}

function writeVisit(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'visit' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(visits)
      .set({ ...lifecycle(row, change, now), revision: nextRouteDraftRevision(row.revision) })
      .where(and(eq(visits.tripId, row.tripId), eq(visits.id, row.id)))
      .returning()
      .get()
  );
}

function writeJourney(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'journey' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(journeys)
      .set(lifecycle(row, change, now))
      .where(and(eq(journeys.tripId, row.tripId), eq(journeys.id, row.id)))
      .returning()
      .get()
  );
}

function writeStay(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'stay' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(stays)
      .set(lifecycle(row, change, now))
      .where(and(eq(stays.tripId, row.tripId), eq(stays.id, row.id)))
      .returning()
      .get()
  );
}

function writeEvent(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'event' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(events)
      .set(lifecycle(row, change, now))
      .where(and(eq(events.tripId, row.tripId), eq(events.id, row.id)))
      .returning()
      .get()
  );
}

function writeRental(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'rental' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(rentals)
      .set({ ...lifecycle(row, change, now), revision: nextRouteDraftRevision(row.revision) })
      .where(and(eq(rentals.tripId, row.tripId), eq(rentals.id, row.id)))
      .returning()
      .get()
  );
}

function writeMeeting(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'meeting' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(meetingPlans)
      .set({
        removed: change.kind === 'remove',
        removalOperationId: change.kind === 'remove' ? change.operationId : null,
        revision: nextRouteDraftRevision(row.revision),
        updatedAt: now,
      })
      .where(and(eq(meetingPlans.tripId, row.tripId), eq(meetingPlans.id, row.id)))
      .returning()
      .get()
  );
}

function writeJourneyLeg(
  db: TripsDb,
  row: Extract<RouteDraftRecord, { kind: 'journey-leg' }>['row'],
  change: RouteDraftLifecycleChange,
  now: string
): void {
  requireOwnedRecord(
    db
      .update(journeyLegs)
      .set({
        removedAt: change.kind === 'remove' ? now : null,
        removalOperationId: change.kind === 'remove' ? change.operationId : null,
        updatedAt: now,
      })
      .where(and(eq(journeyLegs.journeyId, row.journeyId), eq(journeyLegs.id, row.id)))
      .returning()
      .get()
  );
}

/** Change only lifecycle/audit fields and advance the source's existing guard; source facts stay intact. */
export function writeRouteDraftLifecycle(
  db: TripsDb,
  record: RouteDraftRecord,
  change: RouteDraftLifecycleChange,
  now: string
): void {
  switch (record.kind) {
    case 'visit':
      writeVisit(db, record.row, change, now);
      return;
    case 'journey':
      writeJourney(db, record.row, change, now);
      return;
    case 'stay':
      writeStay(db, record.row, change, now);
      return;
    case 'event':
      writeEvent(db, record.row, change, now);
      return;
    case 'rental':
      writeRental(db, record.row, change, now);
      return;
    case 'meeting':
      writeMeeting(db, record.row, change, now);
      return;
    case 'journey-leg':
      writeJourneyLeg(db, record.row, change, now);
      return;
  }
}
