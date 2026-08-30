import { newClientId } from '../components/imports/hooks/useLocalOps';

import type { LocalOp } from '../components/imports/correction-proposal-shared';
import type { CorrectionRule } from '../components/imports/RulePicker';

/** Priority order for browse sidebar. */
export function compareRulesForBrowse(a: CorrectionRule, b: CorrectionRule): number {
  const pa = a.priority - b.priority;
  if (pa !== 0) return pa;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function effectiveRulePriority(rule: CorrectionRule, localOps: LocalOp[]): number {
  for (let i = localOps.length - 1; i >= 0; i -= 1) {
    const o = localOps[i];
    if (!o || o.kind !== 'edit') continue;
    if (o.targetRuleId === rule.id && o.data.priority !== undefined) {
      return o.data.priority;
    }
  }
  return rule.priority;
}

export function sortRulesForBrowseDisplay(
  rules: CorrectionRule[],
  localOps: LocalOp[]
): CorrectionRule[] {
  return [...rules].toSorted((a, b) => {
    const pa = effectiveRulePriority(a, localOps) - effectiveRulePriority(b, localOps);
    if (pa !== 0) return pa;
    return compareRulesForBrowse(a, b);
  });
}

function editDataFromRule(rule: CorrectionRule) {
  return {
    entityId: rule.entityId ?? undefined,
    entityName: rule.entityName ?? undefined,
    location: rule.location ?? undefined,
    tags: rule.tags,
    transactionType: rule.transactionType ?? undefined,
    isActive: rule.isActive,
    confidence: rule.confidence,
    priority: rule.priority,
  };
}

/**
 * Renumber every rule in `orderedRules` to 10, 20, 30, … (gaps of 10).
 *
 * Only correct when `orderedRules` is the COMPLETE rule set: it rewrites the
 * priority of every rule it is given and leaves every rule it is not given
 * untouched, so over a partial window it interleaves the two halves. Use
 * {@link planBrowsePriorityMove} unless completeness is established.
 */
export function applyBrowsePriorityReorder(
  orderedRules: CorrectionRule[],
  localOps: LocalOp[]
): LocalOp[] {
  let next = [...localOps];

  orderedRules.forEach((rule, index) => {
    const newPriority = (index + 1) * 10;
    const prevEffective = effectiveRulePriority(rule, next);
    if (prevEffective === newPriority) return;

    const existingIdx = next.findIndex((o) => o.kind === 'edit' && o.targetRuleId === rule.id);

    if (existingIdx !== -1) {
      const op = next[existingIdx];
      if (!op || op.kind !== 'edit') return;
      next = next.map((o, i) =>
        i === existingIdx && o.kind === 'edit'
          ? { ...o, data: { ...o.data, priority: newPriority }, dirty: true }
          : o
      );
      return;
    }

    next.push({
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: rule.id,
      targetRule: rule,
      data: { ...editDataFromRule(rule), priority: newPriority },
      dirty: true,
    });
  });

  return next;
}

/** Priority the browse list assigns when it appends past the last rule. */
const PRIORITY_STEP = 10;

/**
 * A single drag, expressed as one rule's new priority.
 *
 * `blocked` is not a failure to compute: it means the two rules the dragged one
 * was dropped between hold adjacent priorities, so no value can sit strictly
 * between them. Renumbering to make room is exactly what the caller must not do
 * over a partial window.
 */
export type BrowsePriorityMove =
  | { kind: 'move'; ruleId: string; priority: number }
  | { kind: 'blocked'; reason: string };

/**
 * Where `movedRuleId` belongs after a drag, as ONE priority value.
 *
 * The displayed list is a subsequence of the full priority order — the browse
 * window is capped and ordered by confidence, not priority — so renumbering it
 * would re-rank every rule outside the window against every rule inside it. A
 * value strictly between the new neighbours' priorities lands the rule in the
 * right place globally, because any unseen rule between those neighbours stays
 * between them.
 *
 * @param orderedAfterMove the displayed rules in their post-drag order
 */
export function planBrowsePriorityMove(
  orderedAfterMove: CorrectionRule[],
  movedRuleId: string,
  localOps: LocalOp[]
): BrowsePriorityMove {
  const index = orderedAfterMove.findIndex((r) => r.id === movedRuleId);
  if (index === -1) return { kind: 'blocked', reason: 'The dragged rule is no longer listed.' };

  const priorityAt = (i: number): number | null => {
    const rule = orderedAfterMove[i];
    return rule ? effectiveRulePriority(rule, localOps) : null;
  };
  const before = priorityAt(index - 1);
  const after = priorityAt(index + 1);

  if (before === null && after === null) {
    return { kind: 'blocked', reason: 'A single rule has nothing to be ordered against.' };
  }
  if (before === null) {
    // `priority` is contract-nonnegative, so there is no room below 1.
    const next = after ?? 0;
    if (next < 2) {
      return {
        kind: 'blocked',
        reason: 'No priority is free above the first rule. Lower the rules below it first.',
      };
    }
    return { kind: 'move', ruleId: movedRuleId, priority: Math.floor(next / 2) };
  }
  if (after === null) {
    return { kind: 'move', ruleId: movedRuleId, priority: before + PRIORITY_STEP };
  }
  if (after - before < 2) {
    return {
      kind: 'blocked',
      reason: 'The rules either side hold adjacent priorities, leaving no value between them.',
    };
  }
  return { kind: 'move', ruleId: movedRuleId, priority: before + Math.floor((after - before) / 2) };
}

/** Upsert the single `edit` op that carries out a planned move. */
export function applyBrowsePriorityMove(
  move: Extract<BrowsePriorityMove, { kind: 'move' }>,
  rule: CorrectionRule,
  localOps: LocalOp[]
): LocalOp[] {
  const existingIdx = localOps.findIndex(
    (o) => o.kind === 'edit' && o.targetRuleId === move.ruleId
  );
  if (existingIdx !== -1) {
    return localOps.map((o, i) =>
      i === existingIdx && o.kind === 'edit'
        ? { ...o, data: { ...o.data, priority: move.priority }, dirty: true }
        : o
    );
  }
  return [
    ...localOps,
    {
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: move.ruleId,
      targetRule: rule,
      data: { ...editDataFromRule(rule), priority: move.priority },
      dirty: true,
    },
  ];
}
