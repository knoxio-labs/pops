import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type { HasDefault, HasRuntimeDefault, NotNull } from 'drizzle-orm';
import type { SQLiteTextBuilderInitial } from 'drizzle-orm/sqlite-core';

import type { DecisionSource } from '../../contract/decision-schemas.js';
import type { SourceLink } from '../../contract/schemas.js';

type TimestampColumn<Name extends string> = HasRuntimeDefault<
  HasDefault<NotNull<SQLiteTextBuilderInitial<Name, [string, ...string[]], number | undefined>>>
>;
function timestamp<Name extends string>(name: Name): TimestampColumn<Name> {
  return text(name)
    .notNull()
    .$defaultFn(() => new Date().toISOString());
}
function audit(): {
  createdAt: TimestampColumn<'created_at'>;
  updatedAt: TimestampColumn<'updated_at'>;
} {
  return { createdAt: timestamp('created_at'), updatedAt: timestamp('updated_at') };
}
/** Trip-owned source decisions; option ownership is validated within write transactions. */
export const decisions = sqliteTable('decisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id')
    .notNull()
    .references(() => trips.id),
  question: text('question').notNull().default(''),
  deadline: text('deadline'),
  notes: text('notes').notNull().default(''),
  sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
  selectedOptionId: integer('selected_option_id'),
  revision: integer('revision').notNull().default(0),
  ...audit(),
});
/** Option facts; affected sources intentionally outlive deletion of their referenced records. */
export const decisionOptions = sqliteTable('decision_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  decisionId: integer('decision_id')
    .notNull()
    .references(() => decisions.id),
  removedAt: text('removed_at'),
  title: text('title').notNull().default(''),
  notes: text('notes').notNull().default(''),
  affectedSources: text('affected_sources', { mode: 'json' })
    .$type<DecisionSource[]>()
    .notNull()
    .default([]),
  validatedSources: text('validated_sources', { mode: 'json' })
    .$type<DecisionSource[]>()
    .notNull()
    .default([]),
  sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
  ...audit(),
});
