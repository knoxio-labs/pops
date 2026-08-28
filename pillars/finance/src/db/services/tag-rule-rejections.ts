/**
 * Rejected tag-rule ChangeSet persistence.
 *
 * `POST /tag-rules/reject` demands a written reason. Before POPS-2598 that
 * reason was interpolated into a "revised" proposal that was in fact the
 * rejected one unchanged, and then dropped. It is stored here instead, so a
 * rejection is recoverable: what was refused (`changeSet`, verbatim), the
 * rule shape it would have created (`descriptionPattern` / `matchType` /
 * `entityId` / `tags`, denormalized for lookup), and why (`feedback`).
 *
 * Nothing consumes a rejection automatically yet — the revision engine is
 * POPS-253's decision. This table is the record that makes such an engine,
 * and POPS-254's cleanup pass, possible at all.
 *
 * Standard service pattern: db-arg services, plain functions, no HTTP
 * concerns. No typed errors — an insert cannot miss and an empty table
 * lists as `[]`.
 */
import { desc } from 'drizzle-orm';

import { tagRuleRejections } from '../schema.js';
import { parseTagRuleTags } from './transaction-tag-rules.js';

import type { FinanceDb } from './internal.js';
import type { TagRuleMatchType } from './transaction-tag-rules.js';

/** Raw drizzle row shape. `tags`/`changeSet` are JSON text as stored. */
export type TagRuleRejectionRow = typeof tagRuleRejections.$inferSelect;

/**
 * A rejection as callers want it: `tags` parsed back to a `string[]`, the
 * raw `changeSet` JSON left as text for whoever needs to re-parse it against
 * the ChangeSet schema.
 */
export interface TagRuleRejection {
  id: string;
  descriptionPattern: string | null;
  matchType: TagRuleMatchType | null;
  entityId: string | null;
  tags: string[];
  feedback: string;
  changeSet: string;
  createdAt: string;
}

/**
 * Fields recorded for one rejection. The `descriptionPattern`/`matchType`
 * pair is null together when the rejected ChangeSet carried no `add` op and
 * so proposed no pattern of its own.
 */
export interface RecordTagRuleRejectionInput {
  descriptionPattern: string | null;
  matchType: TagRuleMatchType | null;
  entityId: string | null;
  tags: string[];
  feedback: string;
  /** The rejected ChangeSet; serialized verbatim. */
  changeSet: unknown;
}

function toTagRuleRejection(row: TagRuleRejectionRow): TagRuleRejection {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    tags: parseTagRuleTags(row.tags),
    feedback: row.feedback,
    changeSet: row.changeSet,
    createdAt: row.createdAt,
  };
}

/** Record one rejection and return the row as persisted. */
export function recordTagRuleRejection(
  db: FinanceDb,
  input: RecordTagRuleRejectionInput
): TagRuleRejection {
  const row = db
    .insert(tagRuleRejections)
    .values({
      descriptionPattern: input.descriptionPattern,
      matchType: input.matchType,
      entityId: input.entityId,
      tags: JSON.stringify(input.tags),
      feedback: input.feedback,
      changeSet: JSON.stringify(input.changeSet),
    })
    .returning()
    .get();
  return toTagRuleRejection(row);
}

/** List rejections newest first, optionally capped at `limit`. */
export function listTagRuleRejections(
  db: FinanceDb,
  options: { limit?: number } = {}
): TagRuleRejection[] {
  const query = db.select().from(tagRuleRejections).orderBy(desc(tagRuleRejections.createdAt));
  const rows = options.limit === undefined ? query.all() : query.limit(options.limit).all();
  return rows.map(toTagRuleRejection);
}
