import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { BookingProposalSchema } from '../../contract/booking-import-values.js';
import { BookingExtractInputSchema } from '../../contract/booking-imports.js';
import { bookingImportAttempts } from '../schema.js';
import { claimBookingAttempt } from './booking-import-claim.js';
import { bookingFingerprint, readBookingOriginal } from './booking-import-original.js';
import {
  bookingAttempt,
  bookingBinding,
  bookingReplay,
  bookingSource,
  requireBookingRevision,
} from './booking-import-records.js';
import { TripsServiceError } from './source-record.js';

import type { BookingProposal } from '../../contract/booking-import-values.js';
import type {
  BookingExtractInput,
  BookingExtractionAttempt,
} from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';
import type {
  BookingOriginalDependencies,
  BookingVerifiedOriginal,
} from './booking-import-original.js';

/** Non-dispatching admission metadata; original bytes remain local until the claimed dispatch. */
export interface BookingExtractionAdmission {
  readonly sourceId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly representation: BookingVerifiedOriginal['representation'];
  readonly mediaType: BookingVerifiedOriginal['mediaType'];
  readonly byteLength: number;
}

/** One prepared dispatch closure; callers cannot substitute provider, model or source after admission. */
export interface PreparedBookingExtraction {
  readonly dispatch: (
    original: BookingVerifiedOriginal
  ) => Promise<readonly Omit<BookingProposal, 'id'>[]>;
}

/** Configured provider admission and explicit Documents reads required for one booking extraction. */
export interface BookingExtractionDependencies extends BookingOriginalDependencies {
  readonly prepare?: (input: BookingExtractionAdmission) => Promise<PreparedBookingExtraction>;
}

/** Internal invocation data combines the validated request with explicitly injected owner dependencies. */
export type BookingExtractionInvocation = BookingExtractInput & {
  readonly dependencies?: BookingExtractionDependencies;
};

interface ClaimedExtraction {
  readonly db: TripsDb;
  readonly tripId: number;
  readonly sourceId: string;
  readonly attemptId: string;
  readonly prepared: PreparedBookingExtraction;
  readonly original: BookingVerifiedOriginal;
}

function validateProposals(
  drafts: readonly Omit<BookingProposal, 'id'>[],
  original: BookingVerifiedOriginal
): BookingProposal[] {
  return drafts.map((draft) => {
    const proposal = BookingProposalSchema.parse({ ...draft, id: randomUUID() });
    for (const fact of Object.values(proposal.facts)) {
      for (const evidence of fact.evidence) {
        const valid =
          original.representation === 'stored-text-json-v1'
            ? evidence.kind === 'text' && original.text.includes(evidence.quote)
            : original.mediaType === 'application/pdf' && evidence.kind === 'reported-pdf';
        if (!valid) throw new TripsServiceError('booking_import_invalid');
      }
    }
    return proposal;
  });
}

function assertOriginalMatches(
  source: ReturnType<typeof bookingSource>,
  binding: ReturnType<typeof bookingBinding>,
  original: BookingVerifiedOriginal
): void {
  const fingerprint = bookingFingerprint(original);
  if (
    source.representation !== fingerprint.representation ||
    source.sha256 !== fingerprint.sha256 ||
    source.byteLength !== fingerprint.byteLength ||
    binding.documentsOrigin !== original.documentsOrigin ||
    binding.mediaType !== original.mediaType
  ) {
    throw new TripsServiceError('booking_import_conflict');
  }
}

async function prepareExtraction(
  prepare: NonNullable<BookingExtractionDependencies['prepare']>,
  admission: BookingExtractionAdmission
): Promise<PreparedBookingExtraction> {
  try {
    return await prepare(admission);
  } catch (error) {
    if (error instanceof TripsServiceError) throw error;
    throw new TripsServiceError('booking_import_unavailable');
  }
}

async function finishClaimedExtraction(
  input: ClaimedExtraction
): Promise<BookingExtractionAttempt> {
  const { db, tripId, sourceId, attemptId, prepared, original } = input;
  const identity = and(
    eq(bookingImportAttempts.tripId, tripId),
    eq(bookingImportAttempts.id, attemptId),
    eq(bookingImportAttempts.state, 'claimed')
  );
  try {
    const drafts = await prepared.dispatch(original);
    const proposals = validateProposals(drafts, original);
    db.update(bookingImportAttempts)
      .set({ state: 'succeeded', proposals, updatedAt: new Date().toISOString() })
      .where(identity)
      .run();
  } catch {
    db.update(bookingImportAttempts)
      .set({
        state: 'outcome_unknown',
        failure: 'extraction_unconfirmed',
        updatedAt: new Date().toISOString(),
      })
      .where(identity)
      .run();
  }
  return bookingAttempt(db, tripId, sourceId, attemptId);
}

/** Claim before the sole AI call; unknown or replayed attempts never invoke the provider again. */
export async function extractBookingSource(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  invocation: BookingExtractionInvocation
): Promise<BookingExtractionAttempt> {
  const { dependencies = {}, ...input } = invocation;
  const parsed = BookingExtractInputSchema.parse(input);
  const request = { kind: 'extract', sourceId, input: parsed };
  const replay = bookingReplay(db, tripId, parsed.operationId, request);
  if (replay?.kind === 'extract') return bookingAttempt(db, tripId, sourceId, replay.attemptId);
  const source = bookingSource(db, tripId, sourceId);
  const binding = bookingBinding(db, tripId, sourceId, parsed.bindingId);
  requireBookingRevision(source.revision, parsed.expectedSourceRevision);
  if (dependencies.prepare === undefined) throw new TripsServiceError('booking_import_unavailable');
  const original = await readBookingOriginal(db, tripId, binding.selection, dependencies);
  assertOriginalMatches(source, binding, original);
  const prepared = await prepareExtraction(dependencies.prepare, {
    sourceId,
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    representation: original.representation,
    mediaType: original.mediaType,
    byteLength: original.bytes.byteLength,
  });
  const claim = claimBookingAttempt(db, tripId, sourceId, parsed);
  if (!claim.claimed) return bookingAttempt(db, tripId, sourceId, claim.id);
  return finishClaimedExtraction({ db, tripId, sourceId, attemptId: claim.id, prepared, original });
}
