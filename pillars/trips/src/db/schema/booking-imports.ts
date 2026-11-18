import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type { BookingRequestReceipt } from '../../contract/booking-import-storage.js';
import type {
  BookingDecision,
  BookingOriginalSelection,
  BookingProposal,
  BookingReviewedTarget,
} from '../../contract/booking-import-values.js';
import type {
  BookingExtractionAttempt,
  BookingImportSource,
} from '../../contract/booking-imports.js';

function tripColumn(): ReturnType<typeof integer> {
  return integer('trip_id')
    .notNull()
    .references(() => trips.id);
}

function createdAtColumn(): ReturnType<typeof text> {
  return text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString());
}

/** Verified immutable content identities with mutable extraction and admission revisions. */
export const bookingImportSources = sqliteTable(
  'booking_import_sources',
  {
    id: text('id').primaryKey(),
    tripId: tripColumn(),
    representation: text('representation').$type<BookingImportSource['representation']>().notNull(),
    sha256: text('sha256').notNull(),
    byteLength: integer('byte_length').notNull(),
    revision: integer('revision').notNull().default(0),
    latestAttemptId: text('latest_attempt_id'),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('idx_booking_import_sources_content').on(
      table.tripId,
      table.representation,
      table.sha256,
      table.byteLength
    ),
  ]
);

function sourceColumn(): ReturnType<typeof text> {
  return text('source_id')
    .notNull()
    .references(() => bookingImportSources.id);
}

/** Immutable proofs of the explicitly selected Capture original behind a verified source. */
export const bookingImportBindings = sqliteTable(
  'booking_import_bindings',
  {
    id: text('id').primaryKey(),
    tripId: tripColumn(),
    sourceId: sourceColumn(),
    selection: text('selection', { mode: 'json' }).$type<BookingOriginalSelection>().notNull(),
    documentsOrigin: text('documents_origin'),
    mediaType: text('media_type').$type<'text/plain' | 'application/pdf'>().notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index('idx_booking_import_bindings_source').on(table.sourceId)]
);

function bindingColumn(): ReturnType<typeof text> {
  return text('binding_id')
    .notNull()
    .references(() => bookingImportBindings.id);
}

/** Durable one-shot extraction claims and their noncanonical proposal outcomes. */
export const bookingImportAttempts = sqliteTable(
  'booking_import_attempts',
  {
    id: text('id').primaryKey(),
    tripId: tripColumn(),
    sourceId: sourceColumn(),
    bindingId: bindingColumn(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    predecessorId: text('predecessor_id'),
    state: text('state').$type<BookingExtractionAttempt['state']>().notNull(),
    proposals: text('proposals', { mode: 'json' }).$type<BookingProposal[]>().notNull().default([]),
    failure: text('failure'),
    createdAt: createdAtColumn(),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_booking_import_attempts_source').on(table.sourceId)]
);

/** Explicit reviewed occurrence decisions retain source preconditions and original commit lineage. */
export const bookingImportDecisions = sqliteTable(
  'booking_import_decisions',
  {
    id: text('id').primaryKey(),
    tripId: tripColumn(),
    sourceId: sourceColumn(),
    bindingId: bindingColumn(),
    expectedSourceRevision: integer('expected_source_revision').notNull(),
    expectedCaptureRevision: integer('expected_capture_revision').notNull(),
    admission: text('admission').$type<BookingDecision['admission']>().notNull(),
    attemptId: text('attempt_id').notNull(),
    proposalIds: text('proposal_ids', { mode: 'json' }).$type<string[]>().notNull(),
    target: text('target', { mode: 'json' }).$type<BookingReviewedTarget>().notNull(),
    committedOperationId: text('committed_operation_id'),
    createdAt: createdAtColumn(),
  },
  (table) => [index('idx_booking_import_decisions_source').on(table.sourceId)]
);

/** Canonical request identities and durable receipts make exact operation retries replayable. */
export const bookingImportRequests = sqliteTable(
  'booking_import_requests',
  {
    tripId: tripColumn(),
    operationId: text('operation_id').notNull(),
    sourceId: sourceColumn(),
    canonicalRequest: text('canonical_request').notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<BookingRequestReceipt>().notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('idx_booking_import_requests_operation').on(table.tripId, table.operationId),
  ]
);
