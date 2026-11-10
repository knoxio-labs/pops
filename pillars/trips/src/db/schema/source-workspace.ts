import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';
import {
  sourceAuditColumns,
  sourceOwnershipColumns,
  sourceLocationColumns,
} from './source-columns.js';

import type { CaptureAttachment, TripCapture } from '../../contract/capture-schemas.js';
import type { TripIdea } from '../../contract/idea-schemas.js';
import type {
  CaptureTarget,
  ExploreSource,
  SourceOperation,
  SourceReceipt,
} from '../../contract/source-workspace.js';
import type { SourceInverse } from '../services/source-inverse-types.js';

/** Immutable capture sources retain accepted Documents identities independently of route targets. */
export const captures = sqliteTable(
  'captures',
  {
    ...sourceOwnershipColumns(),
    ...sourceLocationColumns(),
    ...sourceAuditColumns(),
    originalText: text('original_text').notNull(),
    originalUrl: text('original_url'),
    attachments: text('attachments', { mode: 'json' })
      .$type<CaptureAttachment[]>()
      .notNull()
      .default([]),
    title: text('title'),
    notes: text('notes').notNull().default(''),
    classification: text('classification').$type<TripCapture['classification']>(),
  },
  (table) => [index('idx_captures_trip').on(table.tripId)]
);

/** Ideas are independent sources, with no implicit route membership or Contacts-owned data. */
export const ideas = sqliteTable(
  'ideas',
  {
    ...sourceOwnershipColumns(),
    ...sourceLocationColumns(),
    ...sourceAuditColumns(),
    name: text('name'),
    kind: text('kind').$type<TripIdea['kind']>(),
    purpose: text('purpose').$type<TripIdea['purpose']>(),
    status: text('status').$type<TripIdea['status']>(),
    reason: text('reason').notNull().default(''),
    notes: text('notes').notNull().default(''),
    address: text('address'),
    timing: text('timing', { mode: 'json' })
      .$type<TripIdea['timing']>()
      .notNull()
      .default({ mode: 'none' }),
    sourceLinks: text('source_links', { mode: 'json' })
      .$type<TripIdea['sourceLinks']>()
      .notNull()
      .default([]),
    contactLinks: text('contact_links', { mode: 'json' })
      .$type<TripIdea['contactLinks']>()
      .notNull()
      .default([]),
    recommendations: text('recommendations', { mode: 'json' })
      .$type<TripIdea['recommendations']>()
      .notNull()
      .default([]),
  },
  (table) => [index('idx_ideas_trip').on(table.tripId)]
);

/** Organisation preserves capture and target identities and the source revision selected by the user. */
export const captureAssociations = sqliteTable(
  'capture_associations',
  {
    ...sourceOwnershipColumns(),
    ...sourceAuditColumns(),
    captureId: integer('capture_id')
      .notNull()
      .references(() => captures.id),
    target: text('target', { mode: 'json' }).$type<CaptureTarget>().notNull(),
    provenance: text('provenance').$type<'existing' | 'created'>().notNull(),
    sourceRevision: integer('source_revision').notNull(),
  },
  (table) => [index('idx_capture_associations_trip').on(table.tripId)]
);

/** Explore membership is independently tombstoned without deleting its referenced source. */
export const exploreMemberships = sqliteTable(
  'explore_memberships',
  {
    ...sourceOwnershipColumns(),
    ...sourceAuditColumns(),
    source: text('source', { mode: 'json' }).$type<ExploreSource>().notNull(),
  },
  (table) => [index('idx_explore_memberships_trip').on(table.tripId)]
);

/** Trip-scoped replay receipts and conditional inverses remain durable after Undo. */
export const sourceOperations = sqliteTable(
  'source_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    operationId: text('operation_id').notNull(),
    request: text('request', { mode: 'json' }).$type<SourceOperation>().notNull(),
    canonicalRequest: text('canonical_request').notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<SourceReceipt>().notNull(),
    inverse: text('inverse', { mode: 'json' }).$type<SourceInverse>().notNull(),
    undoneBy: text('undone_by'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [uniqueIndex('idx_source_operations_trip_uuid').on(table.tripId, table.operationId)]
);
