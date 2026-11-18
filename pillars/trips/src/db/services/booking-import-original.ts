import { createHash, randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { BookingBindInputSchema } from '../../contract/booking-imports.js';
import { bookingImportBindings, bookingImportSources } from '../schema.js';
import { requireBookingPdfMediaType } from './booking-import-media.js';
import { bookingBinding, bookingReplay, recordBookingRequest } from './booking-import-records.js';
import { getTrip } from './records.js';
import { getCapture, requireSourceRevision } from './source-queries.js';
import { TripsServiceError } from './source-record.js';

import type { BookingOriginalSelection } from '../../contract/booking-import-values.js';
import type { BookingBindInput, BookingSourceBinding } from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';

/** Actual server-read source representation; caller filenames, digests and processing tasks are excluded. */
export type BookingVerifiedOriginal =
  | {
      representation: 'stored-text-json-v1';
      mediaType: 'text/plain';
      text: string;
      bytes: Uint8Array;
      documentsOrigin: null;
    }
  | {
      representation: 'document-bytes-v1';
      mediaType: 'application/pdf';
      bytes: Uint8Array;
      documentsOrigin: string;
    };
/** Sanctioned Documents owner read seam; no arbitrary URL or local-file input is accepted. */
export interface BookingOriginalDependencies {
  readonly readDocument?: (input: {
    documentId: number;
  }) => Promise<{ origin: string; mediaType: string | null; bytes: Uint8Array }>;
}
export interface BookingSourceFingerprint {
  readonly representation: BookingVerifiedOriginal['representation'];
  readonly sha256: string;
  readonly byteLength: number;
}
/** Versioned exact stored-string representation avoids UTF-8 replacement collisions without normalization. */
export function bookingTextOriginal(
  text: string
): Extract<BookingVerifiedOriginal, { representation: 'stored-text-json-v1' }> {
  return {
    representation: 'stored-text-json-v1',
    mediaType: 'text/plain',
    text,
    bytes: Buffer.from(JSON.stringify(text), 'utf8'),
    documentsOrigin: null,
  };
}
/** Verify the explicitly selected original against its current active Capture before any dependent read. */
export async function readBookingOriginal(
  db: TripsDb,
  tripId: number,
  selection: BookingOriginalSelection,
  deps: BookingOriginalDependencies
): Promise<BookingVerifiedOriginal> {
  const capture = getCapture(db, tripId, selection.captureId);
  requireSourceRevision(capture, selection.expectedCaptureRevision);
  if (selection.original.kind === 'text') {
    if (capture.originalText.trim().length === 0)
      throw new TripsServiceError('booking_import_invalid');
    return bookingTextOriginal(capture.originalText);
  }
  const documentId = selection.original.documentId;
  if (
    !capture.attachments.some(
      (attachment) => attachment.kind === 'document' && attachment.documentId === documentId
    )
  )
    throw new TripsServiceError('booking_import_invalid');
  if (deps.readDocument === undefined) throw new TripsServiceError('booking_import_unavailable');
  const original = await deps.readDocument({ documentId });
  const mediaType = requireBookingPdfMediaType(original.mediaType);
  requireSourceRevision(
    getCapture(db, tripId, selection.captureId),
    selection.expectedCaptureRevision
  );
  const origin = new URL(original.origin).origin;
  if (origin === 'null' || !['http:', 'https:'].includes(new URL(origin).protocol))
    throw new TripsServiceError('booking_import_unavailable');
  return {
    representation: 'document-bytes-v1',
    mediaType,
    bytes: Uint8Array.from(original.bytes),
    documentsOrigin: origin,
  };
}
/** Fingerprint the actual verified representation without Unicode or semantic normalization. */
export function bookingFingerprint(original: BookingVerifiedOriginal): BookingSourceFingerprint {
  return {
    representation: original.representation,
    sha256: createHash('sha256').update(original.bytes).digest('hex'),
    byteLength: original.bytes.byteLength,
  };
}

interface PersistBookingBindingInput {
  readonly db: TripsDb;
  readonly tripId: number;
  readonly input: BookingBindInput;
  readonly request: unknown;
  readonly original: BookingVerifiedOriginal;
  readonly fingerprint: BookingSourceFingerprint;
}

function replayedBinding(
  db: TripsDb,
  tripId: number,
  operationId: string,
  request: unknown
): BookingSourceBinding | undefined {
  const replay = bookingReplay(db, tripId, operationId, request);
  if (replay?.kind !== 'bind') return undefined;
  const row = db
    .select()
    .from(bookingImportBindings)
    .where(
      and(eq(bookingImportBindings.tripId, tripId), eq(bookingImportBindings.id, replay.bindingId))
    )
    .get();
  if (row === undefined) throw new TripsServiceError('not_found');
  return bookingBinding(db, tripId, row.sourceId, row.id);
}

function matchingBookingSource(
  db: TripsDb,
  tripId: number,
  fingerprint: BookingSourceFingerprint
): { readonly id: string } | undefined {
  return db
    .select({ id: bookingImportSources.id })
    .from(bookingImportSources)
    .where(
      and(
        eq(bookingImportSources.tripId, tripId),
        eq(bookingImportSources.representation, fingerprint.representation),
        eq(bookingImportSources.sha256, fingerprint.sha256),
        eq(bookingImportSources.byteLength, fingerprint.byteLength)
      )
    )
    .get();
}

function persistBookingBinding(input: PersistBookingBindingInput): BookingSourceBinding {
  const { db, tripId, input: parsed, request, original, fingerprint } = input;
  return db.transaction(
    (tx) => {
      const replay = replayedBinding(tx, tripId, parsed.operationId, request);
      if (replay !== undefined) return replay;
      requireSourceRevision(
        getCapture(tx, tripId, parsed.selection.captureId),
        parsed.selection.expectedCaptureRevision
      );
      const existing = matchingBookingSource(tx, tripId, fingerprint);
      const sourceId = existing?.id ?? randomUUID();
      if (existing === undefined)
        tx.insert(bookingImportSources)
          .values({ id: sourceId, tripId, ...fingerprint })
          .run();
      const id = randomUUID();
      tx.insert(bookingImportBindings)
        .values({
          id,
          tripId,
          sourceId,
          selection: parsed.selection,
          documentsOrigin: original.documentsOrigin,
          mediaType: original.mediaType,
        })
        .run();
      recordBookingRequest({
        db: tx,
        tripId,
        sourceId,
        operationId: parsed.operationId,
        request,
        receipt: { kind: 'bind', bindingId: id },
      });
      return bookingBinding(tx, tripId, sourceId, id);
    },
    { behavior: 'immediate' }
  );
}

/** Bind actual stored content once; exact request replay does not re-fetch an already bound original. */
export async function bindBookingSource(
  db: TripsDb,
  tripId: number,
  input: BookingBindInput,
  deps: BookingOriginalDependencies = {}
): Promise<BookingSourceBinding> {
  const parsed = BookingBindInputSchema.parse(input);
  const request = { kind: 'bind', input: parsed };
  getTrip(db, tripId);
  const replay = replayedBinding(db, tripId, parsed.operationId, request);
  if (replay !== undefined) return replay;
  const original = await readBookingOriginal(db, tripId, parsed.selection, deps);
  const fingerprint = bookingFingerprint(original);
  return persistBookingBinding({ db, tripId, input: parsed, request, original, fingerprint });
}
