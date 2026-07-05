/**
 * Tag-rule matching for the tag-suggester. Split from `index.ts` to keep
 * each file under the per-file line cap. Resolves the active
 * `transaction_tag_rules` whose pattern matches a description (exact /
 * contains / regex), scoped to an optional entity.
 *
 * Every branch matches against the normalized description (`norm`) — the
 * regex branch used to test the raw `description` while exact/contains
 * tested normalized, so a digit-bearing description could match under
 * exact/contains but silently miss under regex (CF022).
 *
 * Ordered `priority ASC, confidence DESC` (ties within a matchType group):
 * lower `priority` wins first, same convention as the corrections matcher.
 * When multiple rules contribute the same tag, `addTagRuleTags`'s dedup keeps
 * whichever rule's attribution came first in this order.
 */
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrectionsService,
  transactionTagRules,
} from '../../../db/index.js';

export interface TagRuleRow {
  id: string;
  tags: string;
  descriptionPattern: string;
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
  const norm = transactionCorrectionsService.normalizeDescription(description);
  const ef = buildEntityFilter(entityId);
  const cols = {
    id: transactionTagRules.id,
    tags: transactionTagRules.tags,
    descriptionPattern: transactionTagRules.descriptionPattern,
  };
  const base = and(eq(transactionTagRules.isActive, true), ef);
  const order = [asc(transactionTagRules.priority), desc(transactionTagRules.confidence)];

  const exact = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'exact'),
        eq(transactionTagRules.descriptionPattern, norm)
      )
    )
    .orderBy(...order)
    .all();

  const contains = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'contains'),
        sql`${norm} LIKE '%' || upper(${transactionTagRules.descriptionPattern}) || '%'`
      )
    )
    .orderBy(...order)
    .all();

  const regexCandidates = db
    .select(cols)
    .from(transactionTagRules)
    .where(and(base, eq(transactionTagRules.matchType, 'regex')))
    .orderBy(...order)
    .all();

  const regex = regexCandidates.filter((r) => {
    try {
      return new RegExp(r.descriptionPattern, 'i').test(norm);
    } catch {
      console.warn(`[tag-rules] invalid regex pattern — skipping rule: ${r.descriptionPattern}`);
      return false;
    }
  });

  return [...exact, ...contains, ...regex];
}
