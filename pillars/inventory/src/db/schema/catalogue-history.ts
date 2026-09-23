import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Statuses in the immutable catalogue revision history. */
export const CATALOGUE_REVISION_STATUSES = ['draft', 'published', 'abandoned'] as const;
/** One of {@link CATALOGUE_REVISION_STATUSES}. */
export type CatalogueRevisionStatus = (typeof CATALOGUE_REVISION_STATUSES)[number];

/** The catalogue publication history, including drafts and abandoned attempts. */
export const catalogueRevisions = sqliteTable(
  'catalogue_revisions',
  {
    revision: integer('revision').primaryKey({ autoIncrement: true }),
    baseRevision: integer('base_revision'),
    status: text('status', { enum: CATALOGUE_REVISION_STATUSES }).notNull(),
    minimumProtocol: integer('minimum_protocol').notNull(),
    createdActorKind: text('created_actor_kind').notNull(),
    createdActorId: text('created_actor_id'),
    createdActorLabel: text('created_actor_label'),
    createdAt: text('created_at').notNull(),
    publishedActorKind: text('published_actor_kind'),
    publishedActorId: text('published_actor_id'),
    publishedActorLabel: text('published_actor_label'),
    publishedAt: text('published_at'),
    publicationNote: text('publication_note'),
    abandonedActorKind: text('abandoned_actor_kind'),
    abandonedActorId: text('abandoned_actor_id'),
    abandonedActorLabel: text('abandoned_actor_label'),
    abandonedAt: text('abandoned_at'),
    draftVersion: integer('draft_version').notNull().default(1),
  },
  (table) => [
    foreignKey({ columns: [table.baseRevision], foreignColumns: [table.revision] }),
    uniqueIndex('catalogue_revisions_one_draft')
      .on(table.status)
      .where(sql`${table.status} = 'draft'`),
    check(
      'ck_catalogue_revisions_status',
      sql`${table.status} IN ('draft', 'published', 'abandoned')`
    ),
    check('ck_catalogue_revisions_minimum_protocol', sql`${table.minimumProtocol} >= 1`),
    check('ck_catalogue_revisions_draft_version', sql`${table.draftVersion} >= 1`),
    check(
      'ck_catalogue_revisions_terminal_state',
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.abandonedAt} IS NULL)
        OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.abandonedAt} IS NULL)
        OR (${table.status} = 'abandoned' AND ${table.publishedAt} IS NULL AND ${table.abandonedAt} IS NOT NULL)`
    ),
  ]
);

/** Compatibility proof for mutations authored against an older catalogue revision. */
export const catalogueCompatibility = sqliteTable(
  'catalogue_compatibility',
  {
    fromRevision: integer('from_revision')
      .notNull()
      .references(() => catalogueRevisions.revision),
    toRevision: integer('to_revision')
      .notNull()
      .references(() => catalogueRevisions.revision),
    classification: text('classification').notNull(),
    affectedIdsJson: text('affected_ids_json').notNull(),
    migrationName: text('migration_name'),
  },
  (table) => [
    primaryKey({ columns: [table.fromRevision, table.toRevision] }),
    check(
      'ck_catalogue_compatibility_affected_ids_json',
      sql`json_valid(${table.affectedIdsJson}) AND json_type(${table.affectedIdsJson}) = 'array'`
    ),
    check('ck_catalogue_compatibility_order', sql`${table.fromRevision} < ${table.toRevision}`),
  ]
);

/** Append-only catalogue audit events. */
export const catalogueEvents = sqliteTable(
  'catalogue_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    revision: integer('revision')
      .notNull()
      .references(() => catalogueRevisions.revision),
    kind: text('kind').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label'),
    beforeJson: text('before_json').notNull(),
    afterJson: text('after_json').notNull(),
    migrationName: text('migration_name'),
    affectedItems: integer('affected_items').notNull().default(0),
    serverTime: text('server_time').notNull(),
  },
  (table) => [
    index('catalogue_events_revision').on(table.revision, table.id),
    check(
      'ck_catalogue_events_before_json',
      sql`json_valid(${table.beforeJson}) AND json_type(${table.beforeJson}) = 'object'`
    ),
    check(
      'ck_catalogue_events_after_json',
      sql`json_valid(${table.afterJson}) AND json_type(${table.afterJson}) = 'object'`
    ),
    check('ck_catalogue_events_affected_items', sql`${table.affectedItems} >= 0`),
  ]
);
