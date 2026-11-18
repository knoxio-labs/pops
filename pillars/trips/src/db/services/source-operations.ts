import { and, eq } from 'drizzle-orm';

import { SourceOperationSchema, SourceReceiptSchema } from '../../contract/source-workspace.js';
import { sourceOperations } from '../schema.js';
import { getTrip } from './records.js';
import { canonicalSourceValue } from './source-canonical.js';
import { currentAffected } from './source-operation-current.js';
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
    journeyLegSets: [],
  };
}
function omitsJourneyLegProof(command: SourceCommand): boolean {
  if (command.kind === 'capture.create')
    return command.target?.mode === 'createJourney' && command.target.legs === undefined;
  return (
    command.kind === 'capture.organise' &&
    command.target.mode === 'createJourney' &&
    command.target.legs === undefined
  );
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
function readReceipt(value: unknown, command: SourceCommand): SourceReceipt {
  const receipt = SourceReceiptSchema.parse(value);
  if (omitsJourneyLegProof(command) && receipt.journeyLegSets === undefined) return receipt;
  return { ...receipt, journeyLegSets: receipt.journeyLegSets ?? [] };
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
  const receipt = readReceipt(existing.receipt, operation.command);
  return {
    receipt,
    current: currentAffected(context.db, context.tripId, receipt),
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
  else {
    writeSourceCommand(write, operation.command);
    if (omitsJourneyLegProof(operation.command)) delete receipt.journeyLegSets;
  }
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

/** Read a saved source-operation receipt with its current affected records and Undo state. */
export function readSourceOperation(
  db: TripsDb,
  tripId: number,
  operationId: string
): SourceOperationResult {
  const row = findOperation({ db, tripId, allowedKinds: [] }, operationId);
  if (row === undefined) throw new TripsServiceError('not_found');
  const receipt = readReceipt(row.receipt, SourceOperationSchema.parse(row.request).command);
  return {
    receipt,
    current: currentAffected(db, tripId, receipt),
    undone: row.undoneBy !== null,
    replayed: true,
  };
}
