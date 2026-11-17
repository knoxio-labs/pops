import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { BookingCommitInputSchema } from '../../contract/booking-imports.js';
import { bookingImportDecisions, bookingImportSources } from '../schema.js';
import { originalBookingCommit, resultForBookingCommit } from './booking-import-commit-replay.js';
import {
  bookingBinding,
  bookingDecision,
  bookingReplay,
  bookingSource,
  recordBookingRequest,
  requireBookingRevision,
} from './booking-import-records.js';
import { operateSourceWorkspace, readSourceOperation } from './source-operations.js';
import { getCapture, requireSourceRevision } from './source-queries.js';
import { TripsServiceError } from './source-record.js';

import type { BookingCommitResult, BookingDecision } from '../../contract/booking-import-values.js';
import type { BookingCommitInput } from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';
import type { CommitReceipt } from './booking-import-commit-replay.js';

interface BookingCommitRequest {
  readonly kind: 'commit';
  readonly sourceId: string;
  readonly input: BookingCommitInput;
}

interface CommitTransactionInput {
  readonly db: TripsDb;
  readonly tripId: number;
  readonly sourceId: string;
  readonly input: BookingCommitInput;
  readonly request: BookingCommitRequest;
}

interface ApplyBookingDecisionsInput extends CommitTransactionInput {
  readonly decisions: BookingDecision[];
}

function validateBatch(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  decisions: BookingDecision[]
): { source: ReturnType<typeof bookingSource>; capture: ReturnType<typeof getCapture> } {
  const first = decisions[0];
  if (first === undefined) throw new TripsServiceError('booking_import_invalid');
  if (
    decisions.some(
      (decision) =>
        decision.bindingId !== first.bindingId ||
        decision.attemptId !== first.attemptId ||
        decision.admission !== first.admission ||
        decision.expectedCaptureRevision !== first.expectedCaptureRevision ||
        decision.expectedSourceRevision !== first.expectedSourceRevision
    )
  )
    throw new TripsServiceError('booking_import_invalid');
  const source = bookingSource(db, tripId, sourceId);
  requireBookingRevision(source.revision, first.expectedSourceRevision);
  const binding = bookingBinding(db, tripId, sourceId, first.bindingId);
  const capture = getCapture(db, tripId, binding.selection.captureId);
  requireSourceRevision(capture, first.expectedCaptureRevision);
  const accepted = db
    .select()
    .from(bookingImportDecisions)
    .where(eq(bookingImportDecisions.sourceId, sourceId))
    .all()
    .some((decision) => decision.committedOperationId !== null);
  if (
    (first.admission === 'initial' && accepted) ||
    (first.admission === 'additional' && !accepted)
  )
    throw new TripsServiceError('booking_import_conflict');
  return { source, capture };
}

function commitReviewedDecisions(input: ApplyBookingDecisionsInput): BookingCommitResult {
  const { db, tripId, sourceId, input: parsed, request, decisions } = input;
  const { source, capture } = validateBatch(db, tripId, sourceId, decisions);
  const sourceOperationIds = decisions.map((decision) => {
    const id = randomUUID();
    const current = getCapture(db, tripId, capture.id);
    operateSourceWorkspace(
      db,
      tripId,
      {
        operationId: id,
        command: {
          kind: 'capture.organise',
          id: capture.id,
          expectedRevision: current.revision,
          target: decision.target,
        },
      },
      ['capture.organise']
    );
    db.update(bookingImportDecisions)
      .set({ committedOperationId: parsed.operationId })
      .where(eq(bookingImportDecisions.id, decision.id))
      .run();
    return id;
  });
  db.update(bookingImportSources)
    .set({ revision: source.revision + 1 })
    .where(eq(bookingImportSources.id, sourceId))
    .run();
  const receipt: CommitReceipt = {
    kind: 'commit',
    decisionIds: parsed.decisionIds,
    sourceOperationIds,
    originalOperationId: parsed.operationId,
  };
  recordBookingRequest({
    db,
    tripId,
    sourceId,
    operationId: parsed.operationId,
    request,
    receipt,
  });
  return {
    kind: 'committed',
    operationId: parsed.operationId,
    results: sourceOperationIds.map((id) => ({
      ...readSourceOperation(db, tripId, id),
      replayed: false,
    })),
  };
}

function commitDecisionBatch(input: CommitTransactionInput): BookingCommitResult {
  const { db, tripId, sourceId, input: parsed, request } = input;
  const replay = bookingReplay(db, tripId, parsed.operationId, request);
  if (replay?.kind === 'commit')
    return resultForBookingCommit(db, tripId, parsed.operationId, replay);
  const decisions = parsed.decisionIds.map((id) => bookingDecision(db, tripId, sourceId, id));
  const original = originalBookingCommit(db, tripId, decisions);
  if (original !== undefined) {
    recordBookingRequest({
      db,
      tripId,
      sourceId,
      operationId: parsed.operationId,
      request,
      receipt: original,
    });
    return resultForBookingCommit(db, tripId, parsed.operationId, original);
  }
  return commitReviewedDecisions({ ...input, decisions });
}

/** Atomically apply reviewed canonical commands; decision tombstones outlive target Undo and deletion. */
export function commitBookingSource(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  input: BookingCommitInput
): BookingCommitResult {
  const parsed = BookingCommitInputSchema.parse(input);
  if (new Set(parsed.decisionIds).size !== parsed.decisionIds.length)
    throw new TripsServiceError('booking_import_invalid');
  const request: BookingCommitRequest = { kind: 'commit', sourceId, input: parsed };
  return db.transaction(
    (tx) => commitDecisionBatch({ db: tx, tripId, sourceId, input: parsed, request }),
    { behavior: 'immediate' }
  );
}
