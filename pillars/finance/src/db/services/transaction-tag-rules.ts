/**
 * Transaction tag rule persistence for the finance domain.
 *
 * The `transaction_tag_rules` table holds the user's tag-suggestion rules:
 * each row maps a description pattern (exact/contains/regex) to a list of
 * suggested tags, optionally scoped to an entity. The `tags` column is a
 * JSON-encoded `string[]` — there is no SQL foreign key from `tags` to
 * `tag_vocabulary.tag`, and `entity_id` carries no schema-level FK either:
 * entities live in the `contacts` pillar, not this DB, so `entity_id` is an
 * opaque foreign id this table cannot enforce at the schema level. Both
 * relationships are the caller's responsibility to keep consistent.
 *
 * Standard service pattern: db-arg services (callers control the connection
 * and can pass a transaction), plain functions, typed domain errors, no HTTP
 * concerns.
 */
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { TransactionTagRuleNotFoundError } from '../errors.js';
import { transactionTagRules } from '../schema.js';

import type { FinanceDb } from './internal.js';

export {
  createOrReinforceTransactionTagRule,
  createTransactionTagRule,
  findExistingTagRule,
  type TagRuleWriteOutcome,
  type TagRuleWriteResult,
} from './transaction-tag-rules-write.js';
export {
  findDuplicateTransactionTagRules,
  findUnreachableTransactionTagRules,
  type TagRuleConflictGroup,
} from './transaction-tag-rules-audit.js';
export {
  loadTagRuleLedgerSnapshot,
  tagRuleLedgerMatchStatus,
  type TagRuleForLedgerMatch,
  type TagRuleLedgerMatchStatus,
  type TagRuleLedgerSnapshot,
} from './tag-rule-ledger-match.js';

export type {
  CreateTransactionTagRuleInput,
  TagRuleMatchType,
  TransactionTagRuleRow,
} from './transaction-tag-rules-types.js';

import type { TagRuleMatchType, TransactionTagRuleRow } from './transaction-tag-rules-types.js';

/**
 * PATCH-style update. Deliberately omits `descriptionPattern` and `matchType` —
 * those fields define the rule's identity and are immutable post-create. To
 * replace a pattern the caller deletes the old rule and creates a new one.
 */
export interface UpdateTransactionTagRuleInput {
  entityId?: string | null;
  tags?: string[];
  confidence?: number;
  isActive?: boolean;
  priority?: number;
}

/** List every rule, ordered by `(confidence DESC, times_applied DESC)`. */
export function listTransactionTagRules(db: FinanceDb): TransactionTagRuleRow[] {
  return db
    .select()
    .from(transactionTagRules)
    .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
    .all();
}

/** Filters + pagination accepted by {@link listTransactionTagRulesPage}. */
export interface TagRuleListQuery {
  matchType?: TagRuleMatchType;
  isActive?: boolean;
  minConfidence?: number;
  limit: number;
  offset: number;
}

/** Result of a paginated, filtered tag-rule list call. */
export interface TagRuleListResult {
  rows: TransactionTagRuleRow[];
  total: number;
}

/**
 * List tag rules with optional `matchType` / `isActive` / `minConfidence`
 * filters, paginated, ordered by `(confidence DESC, times_applied DESC)`.
 * Backs the Tag Rules browser — mirrors `listTransactionCorrections`.
 */
export function listTransactionTagRulesPage(
  db: FinanceDb,
  query: TagRuleListQuery
): TagRuleListResult {
  const { matchType, isActive, minConfidence, limit, offset } = query;
  const conditions = [];
  if (matchType) conditions.push(eq(transactionTagRules.matchType, matchType));
  if (isActive !== undefined) conditions.push(eq(transactionTagRules.isActive, isActive));
  if (minConfidence !== undefined) {
    conditions.push(gte(transactionTagRules.confidence, minConfidence));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const countRow = db.select({ total: count() }).from(transactionTagRules).where(where).all()[0];

  const rows = db
    .select()
    .from(transactionTagRules)
    .where(where)
    .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
    .limit(limit)
    .offset(offset)
    .all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single rule by id. Throws `TransactionTagRuleNotFoundError` if missing. */
export function getTransactionTagRule(db: FinanceDb, id: string): TransactionTagRuleRow {
  const row = db.select().from(transactionTagRules).where(eq(transactionTagRules.id, id)).get();
  if (!row) throw new TransactionTagRuleNotFoundError(id);
  return row;
}

function buildTagRuleUpdates(
  input: UpdateTransactionTagRuleInput
): Partial<typeof transactionTagRules.$inferInsert> {
  const updates: Partial<typeof transactionTagRules.$inferInsert> = {};
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
  if (input.confidence !== undefined) updates.confidence = input.confidence;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.priority !== undefined) updates.priority = input.priority;
  return updates;
}

/**
 * Patch a tag rule. Throws `TransactionTagRuleNotFoundError` if missing.
 *
 * An empty `input` is a no-op that still re-reads and returns the row, so
 * callers can use this as a "fetch with optional patch" without branching.
 */
export function updateTransactionTagRule(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionTagRuleInput
): TransactionTagRuleRow {
  getTransactionTagRule(db, id);

  const updates = buildTagRuleUpdates(input);
  if (Object.keys(updates).length > 0) {
    db.update(transactionTagRules).set(updates).where(eq(transactionTagRules.id, id)).run();
  }

  return getTransactionTagRule(db, id);
}

/** Soft-delete: flip `is_active` to `false`. Throws if the id is unknown. */
export function disableTransactionTagRule(db: FinanceDb, id: string): void {
  const result = db
    .update(transactionTagRules)
    .set({ isActive: false })
    .where(eq(transactionTagRules.id, id))
    .run();
  if (result.changes === 0) throw new TransactionTagRuleNotFoundError(id);
}

/** Hard-delete a rule. Throws if the id is unknown. */
export function deleteTransactionTagRule(db: FinanceDb, id: string): void {
  const result = db.delete(transactionTagRules).where(eq(transactionTagRules.id, id)).run();
  if (result.changes === 0) throw new TransactionTagRuleNotFoundError(id);
}

/**
 * Bump `timesApplied` and stamp `lastUsedAt` without otherwise touching the
 * row. Mirrors `incrementTransactionCorrectionUsage`: best-effort telemetry
 * inside the tag-suggestion pipeline, silently no-ops on an unknown id so a
 * stale rule reference never fails the surrounding transaction.
 */
export function incrementTransactionTagRuleUsage(db: FinanceDb, id: string): void {
  db.update(transactionTagRules)
    .set({
      timesApplied: sql`${transactionTagRules.timesApplied} + 1`,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(transactionTagRules.id, id))
    .run();
}
