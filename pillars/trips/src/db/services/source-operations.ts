import { and, eq } from 'drizzle-orm';

import { EventSchema } from '../../contract/event-schemas.js';
import { JourneySchema } from '../../contract/journey-schemas.js';
import { SourceOperationSchema } from '../../contract/source-workspace.js';
import { StaySchema } from '../../contract/stay-schemas.js';
import { events, journeys, stays, sourceOperations } from '../schema.js';
import { getTrip } from './records.js';
import { canonicalSourceValue } from './source-canonical.js';
import {
  getCapture,
  getIdea,
  getCaptureAssociation,
  getExploreMembership,
} from './source-queries.js';
import { TripsServiceError } from './source-record.js';
import { undoSourceOperation } from './source-undo.js';
import { writeSourceCommand } from './source-write.js';

import type {
  SourceOperation,
  SourceOperationResult,
  SourceReceipt,
  SourceWorkspace,
  SourceCommand,
} from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';
import type { SourceInverse } from './source-inverse-types.js';

/** Capture actions permitted through the capture Undo scope. */
export const CAPTURE_COMMANDS = [
  'capture.create',
  'capture.update',
  'capture.attach',
  'capture.remove',
  'capture.organise',
  'association.remove',
] as const;
/** Idea actions permitted through the idea Undo scope. */
export const IDEA_COMMANDS = ['idea.create', 'idea.update', 'idea.remove'] as const;
/** Membership actions permitted through the Explore Undo scope. */
export const EXPLORE_COMMANDS = ['explore.add', 'explore.remove'] as const;

function emptyWorkspace(): SourceWorkspace {
  return {
    captures: [],
    ideas: [],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    stays: [],
  };
}
function currentAffected(db: TripsDb, tripId: number, receipt: SourceReceipt): SourceWorkspace {
  return {
    captures: receipt.captures.map((row) => getCapture(db, tripId, row.id)),
    ideas: receipt.ideas.map((row) => getIdea(db, tripId, row.id)),
    associations: receipt.associations.map((row) => getCaptureAssociation(db, tripId, row.id)),
    memberships: receipt.memberships.map((row) => getExploreMembership(db, tripId, row.id)),
    events: receipt.events.flatMap((event) => {
      const current = db
        .select()
        .from(events)
        .where(and(eq(events.tripId, tripId), eq(events.id, event.id)))
        .get();
      return current === undefined ? [] : [EventSchema.parse(current)];
    }),
    journeys: receipt.journeys.flatMap((journey) => {
      const current = db
        .select()
        .from(journeys)
        .where(and(eq(journeys.tripId, tripId), eq(journeys.id, journey.id)))
        .get();
      return current === undefined ? [] : [JourneySchema.parse(current)];
    }),
    stays: receipt.stays.flatMap((stay) => {
      const current = db
        .select()
        .from(stays)
        .where(and(eq(stays.tripId, tripId), eq(stays.id, stay.id)))
        .get();
      return current === undefined ? [] : [StaySchema.parse(current)];
    }),
  };
}

interface OperationContext {
  db: TripsDb;
  tripId: number;
  allowedKinds: readonly SourceCommand['kind'][];
}
function findOperation(
  context: OperationContext,
  operationId: string
): typeof sourceOperations.$inferSelect | undefined {
  return context.db
    .select()
    .from(sourceOperations)
    .where(
      and(
        eq(sourceOperations.tripId, context.tripId),
        eq(sourceOperations.operationId, operationId)
      )
    )
    .get();
}
function replayOperation(
  context: OperationContext,
  existing: typeof sourceOperations.$inferSelect,
  operation: SourceOperation,
  canonical: string
): SourceOperationResult {
  if (existing.canonicalRequest !== canonical)
    throw new TripsServiceError('source_operation_mismatch');
  if (operation.command.kind === 'undo') {
    const original = findOperation(context, operation.command.targetOperationId);
    if (original === undefined || !context.allowedKinds.includes(original.request.command.kind))
      throw new TripsServiceError('source_undo_conflict');
  }
  return {
    receipt: existing.receipt,
    current: currentAffected(context.db, context.tripId, existing.receipt),
    undone: existing.undoneBy !== null,
    replayed: true,
  };
}
function applyOperation(
  context: OperationContext,
  operation: SourceOperation,
  canonical: string
): SourceOperationResult {
  const receipt: SourceReceipt = {
    ...emptyWorkspace(),
    operationId: operation.operationId,
    undoneOperationId: null,
  };
  const inverse: SourceInverse = {
    captures: [],
    ideas: [],
    associations: [],
    memberships: [],
    createdEvents: [],
    createdJourneys: [],
    createdStays: [],
  };
  const write = { db: context.db, tripId: context.tripId, receipt, inverse };
  if (operation.command.kind === 'undo')
    undoSourceOperation(write, operation.command.targetOperationId, context.allowedKinds);
  else writeSourceCommand(write, operation.command);
  context.db
    .insert(sourceOperations)
    .values({
      tripId: context.tripId,
      operationId: operation.operationId,
      request: operation,
      canonicalRequest: canonical,
      receipt,
      inverse,
    })
    .run();
  return {
    receipt,
    current: currentAffected(context.db, context.tripId, receipt),
    undone: false,
    replayed: false,
  };
}
function runOperation(
  context: OperationContext,
  operation: SourceOperation
): SourceOperationResult {
  getTrip(context.db, context.tripId);
  if (operation.command.kind !== 'undo' && !context.allowedKinds.includes(operation.command.kind))
    throw new TripsServiceError('source_operation_mismatch');
  const canonical = canonicalSourceValue(operation);
  const existing = findOperation(context, operation.operationId);
  return existing === undefined
    ? applyOperation(context, operation, canonical)
    : replayOperation(context, existing, operation, canonical);
}
/** Apply or replay one typed operation atomically; mismatched UUID reuse and stale Undo never write. */
export function operateSourceWorkspace(
  db: TripsDb,
  tripId: number,
  input: SourceOperation,
  allowedKinds: readonly SourceCommand['kind'][]
): SourceOperationResult {
  const operation = SourceOperationSchema.parse(input);
  return db.transaction((tx) => runOperation({ db: tx, tripId, allowedKinds }, operation), {
    behavior: 'immediate',
  });
}
