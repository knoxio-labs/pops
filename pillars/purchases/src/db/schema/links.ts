/**
 * `purchase_transaction_links` and `purchase_match_rules`.
 *
 * The link table lives here, not in finance. `finance.transactions` gets no
 * schema change and no foreign key points at it — the reference is a soft
 * `pops://finance/transaction/<id>` URI, which is what lets the two pillars
 * be deployed, migrated and restored independently (ADR-042).
 *
 * `confirmedAt` is the whole state machine. NULL means the link was derived
 * by the engine and is disposable: a sweep tears down every unconfirmed link
 * in the affected window and re-solves from scratch. Non-NULL means a human
 * accepted it, and it is pinned — never auto-revised, and acting as a fixed
 * constraint that removes its purchase and transaction from the solvable set.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { LINK_TYPES, MATCH_TYPES, MIN_MATCH_CONFIDENCE } from '../../contract/constants.js';
import { purchases } from './purchases.js';

export const purchaseMatchRules = sqliteTable(
  'purchase_match_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text('description_pattern').notNull(),
    matchType: text('match_type', { enum: MATCH_TYPES }).notNull().default('exact'),
    /** Operative merchant reference. Mirrors `transaction_corrections.entity_id`. */
    entityId: text('entity_id'),
    /** Label for {@link entityId} only. Never matched on, never resolved from. */
    entityName: text('entity_name'),
    location: text('location'),
    tags: text('tags').notNull().default('[]'),
    /** Restricts the rule to one source, e.g. only apply to `amazon` rows. Null applies it everywhere. */
    source: text('source'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    confidence: real('confidence').notNull().default(MIN_MATCH_CONFIDENCE),
    priority: integer('priority').notNull().default(0),
    timesApplied: integer('times_applied').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
  },
  (t) => [
    index('idx_purchase_match_rules_pattern').on(t.descriptionPattern),
    index('idx_purchase_match_rules_priority').on(t.priority),
    index('idx_purchase_match_rules_confidence').on(t.confidence),
    index('idx_purchase_match_rules_times_applied').on(t.timesApplied),
  ]
);

export const purchaseTransactionLinks = sqliteTable(
  'purchase_transaction_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /** Soft cross-pillar URI: `pops://finance/transaction/<id>`. Deliberately not a foreign key. */
    transactionUri: text('transaction_uri').notNull(),
    /** Signed integer cents. Negative for a refund. Summing these against `purchase.totalCents` yields the residual. */
    amountCents: integer('amount_cents').notNull(),
    linkType: text('link_type', { enum: LINK_TYPES }).notNull(),
    confidence: real('confidence').notNull().default(MIN_MATCH_CONFIDENCE),
    matchRuleId: text('match_rule_id').references(() => purchaseMatchRules.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    /** NULL = engine-derived and disposable. Non-NULL = human-confirmed and pinned. */
    confirmedAt: text('confirmed_at'),
  },
  (t) => [
    unique('uq_purchase_transaction_links').on(t.purchaseId, t.transactionUri),
    index('idx_purchase_links_purchase').on(t.purchaseId),
    index('idx_purchase_links_transaction').on(t.transactionUri),
    // The sweep's tear-down predicate: every unconfirmed link, cheaply.
    index('idx_purchase_links_confirmed_at').on(t.confirmedAt),
  ]
);
