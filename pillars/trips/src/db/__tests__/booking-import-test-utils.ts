import { randomUUID } from 'node:crypto';

import { openTripsDb } from '../index.js';
import {
  bindBookingSource,
  extractBookingSource,
  getBookingImport,
} from '../services/booking-imports.js';
import { createTrip } from '../services/records.js';
import { send } from './capture-test-utils.js';

import type { BookingReviewedTarget } from '../../contract/booking-import-values.js';
import type {
  BookingBindInput,
  BookingExtractionAttempt,
  BookingReviewInput,
  BookingSourceBinding,
} from '../../contract/booking-imports.js';
import type { CaptureInput, TripCapture } from '../../contract/capture-schemas.js';
import type { TripsDb } from '../index.js';
import type {
  BookingExtractionDependencies,
  PreparedBookingExtraction,
} from '../services/booking-import-extract.js';

interface BookingFixture {
  readonly tripId: number;
  readonly capture: TripCapture;
  readonly bindInput: BookingBindInput;
}

interface PreparedBookingFixture extends BookingFixture {
  readonly binding: BookingSourceBinding;
  readonly attempt: BookingExtractionAttempt;
  readonly reviewInput: BookingReviewInput;
}

/** Keep asynchronous booking operations inside a real migrated SQLite database lifetime. */
export async function withBookingDb(run: (db: TripsDb) => Promise<void>): Promise<void> {
  const opened = openTripsDb(':memory:');
  try {
    await run(opened.db);
  } finally {
    opened.raw.close();
  }
}

/** Create an original through the production Capture engine, preserving its issued revision. */
export function createBookingCapture(
  db: TripsDb,
  tripId: number,
  input: CaptureInput = { originalText: 'Hotel reservation and theatre ticket' }
): TripCapture {
  const capture = send(db, tripId, { kind: 'capture.create', input }).receipt.captures[0];
  if (!capture) throw new Error('Expected Capture creation receipt');
  return capture;
}

/** A fresh trip and text selection carry actual producer-issued Capture CAS values. */
export function bookingFixture(db: TripsDb): BookingFixture {
  const trip = createTrip(db, {});
  const capture = createBookingCapture(db, trip.id);
  return {
    tripId: trip.id,
    capture,
    bindInput: {
      operationId: randomUUID(),
      selection: {
        captureId: capture.id,
        expectedCaptureRevision: capture.revision,
        original: { kind: 'text' as const },
      },
    },
  };
}

/** Extract fictional proposals through an injected seam, then build an explicit reviewed batch. */
export async function preparedBooking(
  db: TripsDb,
  targets: BookingReviewedTarget[] = [
    { mode: 'createStay', input: { name: 'Harbour Hotel' } },
    { mode: 'createEvent', input: { name: 'Evening performance' } },
  ]
): Promise<PreparedBookingFixture> {
  const fixture = bookingFixture(db);
  const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput, {});
  const attempt = await extractBookingSource(db, fixture.tripId, binding.sourceId, {
    operationId: randomUUID(),
    bindingId: binding.id,
    expectedSourceRevision: getBookingImport(db, fixture.tripId, binding.sourceId).source.revision,
    predecessorId: null,
    providerId: 'fictional-provider',
    modelId: 'fictional-model',
    dependencies: bookingExtraction(async () => [{ kind: 'unclassified', facts: {} }]),
  });
  return {
    ...fixture,
    binding,
    attempt,
    reviewInput: {
      operationId: randomUUID(),
      bindingId: binding.id,
      attemptId: attempt.id,
      expectedSourceRevision: getBookingImport(db, fixture.tripId, binding.sourceId).source
        .revision,
      expectedCaptureRevision: fixture.capture.revision,
      admission: 'initial' as const,
      decisions: targets.map((target) => ({
        proposalIds: attempt.proposals.map((proposal) => proposal.id),
        target,
      })),
    },
  };
}

/** Inject a non-network prepared adapter while preserving the production claim-before-dispatch seam. */
export function bookingExtraction(
  dispatch: PreparedBookingExtraction['dispatch']
): BookingExtractionDependencies {
  return { prepare: async () => ({ dispatch }) };
}
