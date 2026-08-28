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
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';

import { InvalidPatternError, TransactionTagRuleNotFoundError } from '../errors.js';
import { transactionTagRules } from '../schema.js';
import {
  isValidRegexPattern,
  normalizePatternForStorage,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

export {
  findDuplicateTransactionTagRules,
  findUnreachableTransactionTagRules,
  type TagRuleConflictGroup,
} from './transaction-tag-rules-audit.js';

/** Raw drizzle row shape. */
export type TransactionTagRuleRow = typeof transactionTagRules.$inferSelect;

/** Match strategy for the rule's description pattern. */
export type TagRuleMatchType = 'exact' | 'contains' | 'regex';

/** Parse a rule row's JSON-encoded `tags` column into a `string[]`. */
export function parseTagRuleTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** Mutable subset accepted on create. `tags` is the parsed `string[]` form. */
export interface CreateTransactionTagRuleInput {
  descriptionPattern: string;
  matchType: TagRuleMatchType;
  entityId?: string | null;
  tags: string[];
  confidence?: number;
  isActive?: boolean;
  priority?: number;
}

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

function findExistingTagRule(
  db: FinanceDb,
  matchType: TagRuleMatchType,
  normalizedPattern: string,
  entityId: string | null
): TransactionTagRuleRow | undefined {
  return db
    .select()
    .from(transactionTagRules)
    .where(
      and(
        eq(transactionTagRules.matchType, matchType),
        eq(transactionTagRules.descriptionPattern, normalizedPattern),
        entityId === null
          ? isNull(transactionTagRules.entityId)
          : eq(transactionTagRules.entityId, entityId)
      )
    )
    .get();
}

/**
 * Reinforce an existing tag rule hit on the `(normalizedPattern, matchType,
 * entityId)` key: confidence bumped by 0.1 (capped at 1.0), `isActive` reset
 * to true, `tags` overwritten by `input.tags`. `priority` is overlaid only
 * when the input supplies one — mirrors `reinforceExistingCorrection`.
 *
 * `timesApplied` and `lastUsedAt` are deliberately untouched: re-creating a
 * rule is not a use of it. Those two belong exclusively to
 * {@link incrementTransactionTagRuleUsage}, called from the matcher, so
 * `timesApplied` stays readable as usage evidence (POPS-2597/POPS-254).
 */
function reinforceExistingTagRule(
  db: FinanceDb,
  existing: TransactionTagRuleRow,
  input: CreateTransactionTagRuleInput
): TransactionTagRuleRow {
  return db
    .update(transactionTagRules)
    .set({
      confidence: Math.min(existing.confidence + 0.1, 1.0),
      tags: JSON.stringify(input.tags),
      priority: input.priority ?? existing.priority,
      isActive: true,
    })
    .where(eq(transactionTagRules.id, existing.id))
    .returning()
    .get();
}

/**
 * Create-or-reinforce a tag rule keyed on `(normalized descriptionPattern,
 * matchType, entityId)` — mirrors `createOrUpdateTransactionCorrection` so a
 * case/digit variant of an already-known pattern (e.g. `'K Mart'` vs
 * `'k mart 42'`) reinforces the existing row instead of forking a duplicate
 * that then never matches under `matchType: 'exact'` (CF022). `entityId` is
 * part of the key (unlike corrections, which has no entity-scoping concept)
 * so two rules deliberately scoped to different entities never collapse into
 * one.
 *
 * `tags` is JSON-encoded before insert. Insert defaults: `confidence=0.95`,
 * `isActive=true`, `priority=0`, `timesApplied=0`. The generated `id` is a
 * UUID from drizzle's `$defaultFn`.
 *
 * `descriptionPattern` is normalized (uppercased, digit-stripped,
 * whitespace-collapsed) for `exact`/`contains` patterns, which are matched
 * against a normalized description and need the same treatment to line up.
 * A `regex` pattern is stored raw: `normalizeDescription` uppercases every
 * character including metacharacters (`\d` -> `\D`, `\s` -> `\S`), which
 * would silently corrupt the pattern. An uncompilable `regex` pattern throws
 * `InvalidPatternError` (-> 400) instead of being stored as a rule that can
 * never fire (POPS-2600).
 */
export function createTransactionTagRule(
  db: FinanceDb,
  input: CreateTransactionTagRuleInput
): TransactionTagRuleRow {
  if (input.matchType === 'regex' && !isValidRegexPattern(input.descriptionPattern)) {
    throw new InvalidPatternError(input.descriptionPattern);
  }
  const normalized = normalizePatternForStorage(input.descriptionPattern, input.matchType);
  const entityId = input.entityId ?? null;

  const existing = findExistingTagRule(db, input.matchType, normalized, entityId);
  if (existing) return reinforceExistingTagRule(db, existing, input);

  return db
    .insert(transactionTagRules)
    .values({
      descriptionPattern: normalized,
      matchType: input.matchType,
      entityId,
      tags: JSON.stringify(input.tags),
      confidence: input.confidence ?? 0.95,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
      timesApplied: 0,
    })
    .returning()
    .get();
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
