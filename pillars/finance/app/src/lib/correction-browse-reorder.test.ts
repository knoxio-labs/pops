import { describe, expect, it } from 'vitest';

import {
  applyBrowsePriorityMove,
  applyBrowsePriorityReorder,
  compareRulesForBrowse,
  effectiveRulePriority,
  planBrowsePriorityMove,
  sortRulesForBrowseDisplay,
} from './correction-browse-reorder';

import type { LocalOp } from '../components/imports/correction-proposal-shared';
import type { CorrectionRule } from '../components/imports/RulePicker';

function rule(
  partial: Partial<CorrectionRule> & Pick<CorrectionRule, 'id' | 'descriptionPattern'>
): CorrectionRule {
  return {
    matchType: 'exact',
    accountId: null,
    entityId: null,
    entityName: null,
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.9,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...partial,
  };
}

describe('correction-browse-reorder', () => {
  it('sorts by priority then id', () => {
    const rules = [
      rule({ id: 'b', descriptionPattern: 'B', priority: 20 }),
      rule({ id: 'a', descriptionPattern: 'A', priority: 10 }),
    ];
    const sorted = sortRulesForBrowseDisplay(rules, []);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('respects priority from local edit ops', () => {
    const rules = [
      rule({ id: 'a', descriptionPattern: 'A', priority: 10 }),
      rule({ id: 'b', descriptionPattern: 'B', priority: 20 }),
    ];
    const localOps: LocalOp[] = [
      {
        kind: 'edit',
        clientId: 'e1',
        targetRuleId: 'b',
        targetRule: rules[1] ?? null,
        data: { priority: 5 },
        dirty: true,
      },
    ];
    const sorted = sortRulesForBrowseDisplay(rules, localOps);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('applyBrowsePriorityReorder assigns gaps of 10', () => {
    const r0 = rule({ id: 'x', descriptionPattern: 'X', priority: 10 });
    const r1 = rule({ id: 'y', descriptionPattern: 'Y', priority: 20 });
    const reordered = [r1, r0];
    const next = applyBrowsePriorityReorder(reordered, []);
    expect(next).toHaveLength(2);
    expect(next[0]?.kind).toBe('edit');
    expect(next[1]?.kind).toBe('edit');
    if (next[0]?.kind === 'edit' && next[1]?.kind === 'edit') {
      const byId = Object.fromEntries(
        next.map((o) => (o.kind === 'edit' ? [o.targetRuleId, o.data.priority] : []))
      );
      expect(byId['y']).toBe(10);
      expect(byId['x']).toBe(20);
    }
  });

  it('compareRulesForBrowse tie-breaks by id', () => {
    const a = rule({ id: 'a', descriptionPattern: 'A', priority: 0 });
    const b = rule({ id: 'b', descriptionPattern: 'B', priority: 0 });
    expect(compareRulesForBrowse(a, b)).toBeLessThan(0);
  });

  it('effectiveRulePriority reads last matching edit', () => {
    const r = rule({ id: 'a', descriptionPattern: 'A', priority: 100 });
    const ops: LocalOp[] = [
      {
        kind: 'edit',
        clientId: '1',
        targetRuleId: 'a',
        targetRule: r,
        data: { priority: 50 },
        dirty: true,
      },
      {
        kind: 'edit',
        clientId: '2',
        targetRuleId: 'a',
        targetRule: r,
        data: { priority: 30 },
        dirty: true,
      },
    ];
    expect(effectiveRulePriority(r, ops)).toBe(30);
  });
});

/**
 * The browse window is capped and ordered by confidence, so the rules on screen
 * are a cross-section of priority order. Renumbering that cross-section rewrites
 * the matcher's ordering for rules nobody looked at, which is why a partial
 * window plans a single move instead.
 */
describe('planBrowsePriorityMove', () => {
  const a = rule({ id: 'a', descriptionPattern: 'A', priority: 100 });
  const b = rule({ id: 'b', descriptionPattern: 'B', priority: 200 });
  const c = rule({ id: 'c', descriptionPattern: 'C', priority: 300 });

  it('lands a rule between its new neighbours', () => {
    expect(planBrowsePriorityMove([a, c, b], 'c', [])).toEqual({
      kind: 'move',
      ruleId: 'c',
      priority: 150,
    });
  });

  it('emits exactly one edit op, leaving every other rule un-renumbered', () => {
    const move = planBrowsePriorityMove([a, c, b], 'c', []);
    if (move.kind !== 'move') throw new Error('expected a move');

    const ops = applyBrowsePriorityMove(move, c, []);

    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind === 'edit' && ops[0].targetRuleId).toBe('c');
    expect(ops[0]?.kind === 'edit' && ops[0].data.priority).toBe(150);
  });

  it('appends past the last rule with a step, not a renumber', () => {
    expect(planBrowsePriorityMove([b, c, a], 'a', [])).toEqual({
      kind: 'move',
      ruleId: 'a',
      priority: 310,
    });
  });

  it('halves the first priority when dropped at the top', () => {
    expect(planBrowsePriorityMove([b, a, c], 'b', [])).toEqual({
      kind: 'move',
      ruleId: 'b',
      priority: 50,
    });
  });

  it('refuses rather than renumber when the neighbours are adjacent', () => {
    const tight = [
      rule({ id: 'x', descriptionPattern: 'X', priority: 10 }),
      rule({ id: 'z', descriptionPattern: 'Z', priority: 40 }),
      rule({ id: 'y', descriptionPattern: 'Y', priority: 11 }),
    ];

    expect(planBrowsePriorityMove(tight, 'z', []).kind).toBe('blocked');
  });

  it('refuses rather than renumber when there is no room above the first rule', () => {
    const atZero = [
      rule({ id: 'z', descriptionPattern: 'Z', priority: 50 }),
      rule({ id: 'x', descriptionPattern: 'X', priority: 1 }),
    ];

    expect(planBrowsePriorityMove(atZero, 'z', []).kind).toBe('blocked');
  });

  it("reads a pending edit as the neighbour's current priority", () => {
    const ops: LocalOp[] = [
      {
        kind: 'edit',
        clientId: 'e1',
        targetRuleId: 'b',
        targetRule: b,
        data: { priority: 900 },
        dirty: true,
      },
    ];

    expect(planBrowsePriorityMove([a, c, b], 'c', ops)).toEqual({
      kind: 'move',
      ruleId: 'c',
      priority: 500,
    });
  });

  it('updates the existing edit op instead of stacking a second one', () => {
    const ops: LocalOp[] = [
      {
        kind: 'edit',
        clientId: 'e1',
        targetRuleId: 'c',
        targetRule: c,
        data: { priority: 999 },
        dirty: true,
      },
    ];

    const next = applyBrowsePriorityMove({ kind: 'move', ruleId: 'c', priority: 150 }, c, ops);

    expect(next).toHaveLength(1);
    expect(next[0]?.kind === 'edit' && next[0].data.priority).toBe(150);
  });
});
