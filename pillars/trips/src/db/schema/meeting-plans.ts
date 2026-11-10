import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type {
  MeetingPlan,
  MeetingPlanOperation,
  MeetingPlanReceipt,
} from '../../contract/meeting-plan-schemas.js';

/** Meeting facts belong only to Trips; a Visit reference survives source unavailability without a foreign-key rewrite. */
export const meetingPlans = sqliteTable(
  'meeting_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    revision: integer('revision').notNull().default(1),
    removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
    contactUri: text('contact_uri'),
    visitId: integer('visit_id'),
    title: text('title').notNull().default(''),
    notes: text('notes').notNull().default(''),
    intention: text('intention').$type<MeetingPlan['intention']>().notNull().default('Considering'),
    agreement: text('agreement').$type<MeetingPlan['agreement']>().notNull().default('Not agreed'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_meeting_plans_trip').on(table.tripId)]
);

/** Immutable retry outcomes and separate mutable guards for proven own Undo lineage. */
export const meetingPlanOperations = sqliteTable(
  'meeting_plan_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    operationId: text('operation_id').notNull(),
    request: text('request', { mode: 'json' }).$type<MeetingPlanOperation>().notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<MeetingPlanReceipt>().notNull(),
    expectedAfter: text('expected_after', { mode: 'json' }).$type<MeetingPlan>().notNull(),
    undoneBy: text('undone_by'),
  },
  (table) => [
    uniqueIndex('idx_meeting_plan_operations_identity').on(table.tripId, table.operationId),
  ]
);
