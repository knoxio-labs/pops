/**
 * The rule set a tag-rule ChangeSet would leave behind, computed in memory.
 *
 * The ChangeSet impact preview answers "what will this rule do?", which is a
 * question about the *whole* rule set, not about the proposed rule alone: a
 * rule proposing a tag an existing rule already supplies changes nothing, and
 * a `disable`/`remove` op changes something only by reference to what is
 * persisted. So the preview overlays the ChangeSet on the persisted rules and
 * runs the production suggester over the result — the merged-rules shape
 * `applyLearnedCorrection` already uses for correction previews (CF040),
 * rather than a second one (POPS-2599).
 *
 * Every op is mirrored on the write path in `service.ts`'s `applyOp`, down to
 * `add`'s create-or-reinforce key: an `add` whose (normalized pattern,
 * matchType, entityId) already exists overwrites that row's tags and
 * reactivates it rather than forking a duplicate, exactly as
 * `createTransactionTagRule` does. A preview that appended instead would show
 * a rule narrowing its own tag list as adding nothing.
 */
import { transactionCorrectionsService, transactionTagRulesService } from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';

import type {
  TagRuleChangeSet,
  TagRuleChangeSetOp,
  TagRuleUpdate,
} from '../../../contract/rest-tag-rules.js';
import type { FinanceDb } from '../../../db/index.js';
import type { InMemoryTagRule } from '../tag-suggester/tag-rule-matching.js';

const { normalizePatternForStorage } = transactionCorrectionsService;

const REINFORCE_CONFIDENCE_STEP = 0.1;

/** The persisted rule set in the shape the suggester's in-memory matcher takes. */
export function loadPersistedTagRules(db: FinanceDb): InMemoryTagRule[] {
  return transactionTagRulesService.listTransactionTagRules(db).map((row) => ({
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    tags: parseStoredTags(row.tags),
    isActive: row.isActive,
    confidence: row.confidence,
    priority: row.priority,
  }));
}

function withEdit(rule: InMemoryTagRule, data: TagRuleUpdate): InMemoryTagRule {
  return {
    ...rule,
    entityId: data.entityId === undefined ? rule.entityId : (data.entityId ?? null),
    tags: data.tags ?? rule.tags,
    confidence: data.confidence ?? rule.confidence,
    isActive: data.isActive ?? rule.isActive,
    priority: data.priority ?? rule.priority,
  };
}

type AddOp = Extract<TagRuleChangeSetOp, { op: 'add' }>;

function isReinforcementTarget(rule: InMemoryTagRule, op: AddOp, pattern: string): boolean {
  return (
    rule.matchType === op.data.matchType &&
    rule.descriptionPattern === pattern &&
    rule.entityId === (op.data.entityId ?? null)
  );
}

function applyAdd(rules: InMemoryTagRule[], op: AddOp, index: number): InMemoryTagRule[] {
  const pattern = normalizePatternForStorage(op.data.descriptionPattern, op.data.matchType);
  const existing = rules.find((rule) => isReinforcementTarget(rule, op, pattern));
  if (existing) {
    return rules.map((rule) =>
      rule === existing
        ? {
            ...rule,
            tags: op.data.tags,
            isActive: true,
            confidence: Math.min(rule.confidence + REINFORCE_CONFIDENCE_STEP, 1),
            priority: op.data.priority ?? rule.priority,
          }
        : rule
    );
  }
  return [
    ...rules,
    {
      id: `proposed:${index}`,
      descriptionPattern: pattern,
      matchType: op.data.matchType,
      entityId: op.data.entityId ?? null,
      tags: op.data.tags,
      isActive: op.data.isActive ?? true,
      confidence: op.data.confidence ?? 0.95,
      priority: op.data.priority ?? 0,
    },
  ];
}

function applyOp(
  rules: InMemoryTagRule[],
  op: TagRuleChangeSetOp,
  index: number
): InMemoryTagRule[] {
  switch (op.op) {
    case 'add':
      return applyAdd(rules, op, index);
    case 'edit':
      return rules.map((rule) => (rule.id === op.id ? withEdit(rule, op.data) : rule));
    case 'disable':
      return rules.map((rule) => (rule.id === op.id ? { ...rule, isActive: false } : rule));
    case 'remove':
      return rules.filter((rule) => rule.id !== op.id);
  }
}

/**
 * The rule set `changeSet` would leave behind, applied over `persisted` in op
 * order. Pure: neither argument is mutated and nothing is written.
 */
export function mergeChangeSetOverRules(
  persisted: readonly InMemoryTagRule[],
  changeSet: TagRuleChangeSet
): InMemoryTagRule[] {
  let merged = [...persisted];
  for (const [index, op] of changeSet.ops.entries()) merged = applyOp(merged, op, index);
  return merged;
}
