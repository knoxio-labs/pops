/**
 * `purchase_match_rules` — learned corrections for the matcher.
 *
 * Mirrors finance's `transaction_corrections` field-for-field so a rule
 * means the same thing on both sides of the seam, including the invariant
 * that `entityId` is operative and `entityName` is only its label — see
 * `pillars/finance/src/db/schema/corrections.ts`.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { MATCH_TYPES, MIN_MATCH_CONFIDENCE } from '../../contract/constants.js';

export const purchaseMatchRules = sqliteTable(
  'purchase_match_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text('description_pattern').notNull(),
    matchType: text('match_type', { enum: MATCH_TYPES }).notNull().default('exact'),
    /** Operative merchant reference into `contacts`. */
    entityId: text('entity_id'),
    /** Label for {@link entityId} only. Never matched on, never resolved from. */
    entityName: text('entity_name'),
    location: text('location'),
    tags: text('tags').notNull().default('[]'),
    /** Restricts the rule to one source. Null applies it everywhere. */
    source: text('source'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    confidence: real('confidence').notNull().default(MIN_MATCH_CONFIDENCE),
    priority: integer('priority').notNull().default(0),
    timesApplied: integer('times_applied').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    lastUsedAt: text('last_used_at'),
  },
  (t) => [
    // What makes a decision idempotent. A pattern means one thing for one
    // source, so confirming the tenth order from the same merchant finds
    // this row and counts an application rather than minting a tenth rule
    // that says what the first already said. SQLite treats NULLs as
    // distinct, so it constrains nothing for a rule that applies
    // everywhere — the queue's writer always scopes to the order's source,
    // and an unscoped rule is a human's deliberate act.
    unique('uq_purchase_match_rules_pattern_source').on(t.descriptionPattern, t.source),
    index('idx_purchase_match_rules_pattern').on(t.descriptionPattern),
    index('idx_purchase_match_rules_priority').on(t.priority),
    index('idx_purchase_match_rules_confidence').on(t.confidence),
    index('idx_purchase_match_rules_times_applied').on(t.timesApplied),
  ]
);
