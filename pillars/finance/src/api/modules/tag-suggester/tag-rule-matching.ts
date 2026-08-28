/**
 * Tag-rule matching for the tag-suggester. Split from `index.ts` to keep
 * each file under the per-file line cap. Resolves the active
 * `transaction_tag_rules` whose pattern matches a description, scoped to an
 * optional entity.
 *
 * The pattern test is `patternMatchesDescription` — the one predicate every
 * match path shares (POPS-2600). It used to be split across
 * SQL (`=` on the raw pattern, `LIKE '%' || upper(p) || '%'`) and JS, which
 * meant the live path and the ChangeSet preview could disagree about the same
 * rule. SQLite's `LIKE` cannot faithfully reproduce the shared predicate's
 * match set without a registered function, so the whole test now runs in JS
 * over one candidate fetch.
 *
 * `isActive` and the entity scope stay in the SQL `WHERE` as a cheap
 * pre-narrowing, but they are re-tested in {@link matchTagRules} because that
 * function also serves an in-memory rule set — the ChangeSet preview's merged
 * rules (POPS-2599), where a `disable` op flips `isActive` on a row SQL would
 * still have returned. One predicate, one ordering, both callers.
 *
 * Which representation each branch matches against is the shared predicate's
 * decision, not this module's — it used to be made here, and differently from
 * everywhere else (CF022).
 *
 * Ordered `priority ASC, confidence DESC` (ties within a matchType group):
 * lower `priority` wins first, same convention as the corrections matcher.
 * When multiple rules contribute the same tag, `addTagRuleTags`'s dedup keeps
 * whichever rule's attribution came first in this order.
 */
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrectionsService,
  transactionTagRules,
} from '../../../db/index.js';

import type { MatchableDescription } from '../../../contract/pattern-match.js';

const { describeForMatching, patternMatchesDescription } = transactionCorrectionsService;

const MATCH_TYPE_GROUP_ORDER = ['exact', 'contains', 'regex'] as const;

export type TagRuleMatchType = (typeof MATCH_TYPE_GROUP_ORDER)[number];

export interface TagRuleRow {
  id: string;
  tags: string;
  descriptionPattern: string;
}

/** The fields {@link matchTagRules} needs to decide whether a rule fires, and in what order. */
export interface TagRuleMatchable {
  descriptionPattern: string;
  matchType: TagRuleMatchType;
  entityId: string | null;
  isActive: boolean;
  confidence: number;
  priority: number;
}

/**
 * A tag rule supplied in memory rather than read from `transaction_tag_rules`
 * — the ChangeSet preview's merged rule set. `tags` is the parsed form; the
 * table's JSON column is parsed on the way in.
 */
export interface InMemoryTagRule extends TagRuleMatchable {
  id: string;
  tags: string[];
}

function ruleFires(
  rule: TagRuleMatchable,
  entityId: string | null,
  description: MatchableDescription
): boolean {
  if (!rule.isActive) return false;
  if (rule.entityId !== null && rule.entityId !== entityId) return false;
  return patternMatchesDescription(rule.descriptionPattern, rule.matchType, description);
}

/**
 * The rules in `rules` that fire for `description` under `entityId`, ordered
 * `matchType` group (exact, contains, regex), then `priority ASC,
 * confidence DESC` within each group.
 */
export function matchTagRules<T extends TagRuleMatchable>(
  rules: readonly T[],
  description: string,
  entityId: string | null
): T[] {
  const matchable = describeForMatching(description);
  const matched = rules
    .filter((rule) => ruleFires(rule, entityId, matchable))
    .toSorted((a, b) => a.priority - b.priority || b.confidence - a.confidence);

  return MATCH_TYPE_GROUP_ORDER.flatMap((matchType) =>
    matched.filter((rule) => rule.matchType === matchType)
  );
}

function buildEntityFilter(entityId: string | null): ReturnType<typeof or> {
  return entityId !== null
    ? or(isNull(transactionTagRules.entityId), eq(transactionTagRules.entityId, entityId))
    : isNull(transactionTagRules.entityId);
}

export function findMatchingTagRules(
  db: FinanceDb,
  description: string,
  entityId: string | null
): TagRuleRow[] {
  const candidates = db
    .select({
      id: transactionTagRules.id,
      tags: transactionTagRules.tags,
      descriptionPattern: transactionTagRules.descriptionPattern,
      matchType: transactionTagRules.matchType,
      entityId: transactionTagRules.entityId,
      isActive: transactionTagRules.isActive,
      confidence: transactionTagRules.confidence,
      priority: transactionTagRules.priority,
    })
    .from(transactionTagRules)
    .where(and(eq(transactionTagRules.isActive, true), buildEntityFilter(entityId)))
    .orderBy(asc(transactionTagRules.priority), desc(transactionTagRules.confidence))
    .all();

  return matchTagRules(candidates, description, entityId).map(
    ({ id, tags, descriptionPattern }) => ({
      id,
      tags,
      descriptionPattern,
    })
  );
}
