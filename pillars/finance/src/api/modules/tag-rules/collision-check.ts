/**
 * Server-side collision check for a tag-rule `add` op: whether it would
 * create a new rule or merge into one that already exists — the same
 * `(matchType, normalized descriptionPattern, entityId)` key
 * `createOrReinforceTransactionTagRule` resolves an `add` against
 * (POPS-2755) — surfaced before the commit that would actually resolve it
 * (POPS-2955).
 *
 * Final Review renders every staged `add` op as a plain ADD today, because
 * the collision is decided server-side and Final Review has no round trip to
 * ask. This is that round trip. It reuses `findExistingTagRule` — the exact
 * lookup the write path performs — rather than fetching
 * `listTransactionTagRulesPage` and matching client-side: that list is
 * paginated for the Tag Rules browser, and treating a page as the complete
 * rule set is the "capped list consumed as the complete set" failure
 * POPS-2696 was filed for. This runs one indexed lookup per `add` op instead.
 */
import { transactionCorrectionsService, transactionTagRulesService } from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';

import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';
import type { FinanceDb } from '../../../db/index.js';

const { normalizePatternForStorage } = transactionCorrectionsService;

/** What an `add` op would land on. Absent (`null`) means it would create a new rule. */
export interface TagRuleAddCollision {
  ruleId: string;
  existingTags: string[];
}

/**
 * One entry per op in `changeSet.ops`, in the same order the caller sent
 * them: the collision for an `add` op that would merge into an existing
 * rule, or `null` for an `add` that would create a new one, or for any
 * non-`add` op (which already names the rule it targets, so collision is not
 * a question that applies to it).
 */
export function resolveTagRuleAddCollisions(
  db: FinanceDb,
  changeSet: TagRuleChangeSet
): (TagRuleAddCollision | null)[] {
  return changeSet.ops.map((op) => {
    if (op.op !== 'add') return null;

    const normalized = normalizePatternForStorage(op.data.descriptionPattern, op.data.matchType);
    const existing = transactionTagRulesService.findExistingTagRule(
      db,
      op.data.matchType,
      normalized,
      op.data.entityId ?? null
    );
    if (!existing) return null;

    return { ruleId: existing.id, existingTags: parseStoredTags(existing.tags) };
  });
}
