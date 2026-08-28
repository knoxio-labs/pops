/**
 * Tag-rule matching for the tag-suggester. Split from `index.ts` to keep
 * each file under the per-file line cap. Resolves the active
 * `transaction_tag_rules` whose pattern matches a description, scoped to an
 * optional entity.
 *
 * The pattern test is `patternMatchesNormalizedDescription` — the one
 * predicate every match path shares (POPS-2600). It used to be split across
 * SQL (`=` on the raw pattern, `LIKE '%' || upper(p) || '%'`) and JS, which
 * meant the live path and the ChangeSet preview could disagree about the same
 * rule. SQLite's `LIKE` cannot faithfully reproduce a
 * post-`normalizeDescription` match set without a registered function, so the
 * whole test now runs in JS over one candidate fetch; `isActive` and the
 * entity scope stay in SQL, where they are cheap and exact.
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
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrectionsService,
  transactionTagRules,
} from '../../../db/index.js';

const { normalizeDescription, patternMatchesNormalizedDescription } = transactionCorrectionsService;

const MATCH_TYPE_GROUP_ORDER = ['exact', 'contains', 'regex'] as const;

export interface TagRuleRow {
  id: string;
  tags: string;
  descriptionPattern: string;
}

interface TagRuleCandidate extends TagRuleRow {
  matchType: (typeof MATCH_TYPE_GROUP_ORDER)[number];
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
  const norm = normalizeDescription(description);

  const matched: TagRuleCandidate[] = db
    .select({
      id: transactionTagRules.id,
      tags: transactionTagRules.tags,
      descriptionPattern: transactionTagRules.descriptionPattern,
      matchType: transactionTagRules.matchType,
    })
    .from(transactionTagRules)
    .where(and(eq(transactionTagRules.isActive, true), buildEntityFilter(entityId)))
    .orderBy(asc(transactionTagRules.priority), desc(transactionTagRules.confidence))
    .all()
    .filter((rule) =>
      patternMatchesNormalizedDescription(rule.descriptionPattern, rule.matchType, norm)
    );

  return MATCH_TYPE_GROUP_ORDER.flatMap((matchType) =>
    matched
      .filter((rule) => rule.matchType === matchType)
      .map(({ matchType: _matchType, ...row }) => row)
  );
}
