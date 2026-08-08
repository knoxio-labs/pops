import { describe, expect, it } from 'vitest';

import { elementAt } from '../test-utils';
import { computeMergedEntities, computeMergedRules } from './merged-state';

import type { Correction, Entity } from '@pops/finance';

import type { ChangeSet, PendingChangeSet, PendingEntity } from '../store/importStore';

function makeRule(overrides: Partial<Correction> = {}): Correction {
  return {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'exact',
    entityId: 'entity-1',
    entityName: 'Woolworths',
    location: null,
    tags: [],
    transactionType: 'purchase',
    isActive: true,
    confidence: 0.95,
    timesApplied: 10,
    priority: 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastUsedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makePendingChangeSet(
  changeSet: ChangeSet,
  overrides: Partial<PendingChangeSet> = {}
): PendingChangeSet {
  return {
    tempId: `temp:changeset:${crypto.randomUUID()}`,
    changeSet,
    appliedAt: '2026-04-12T00:00:00Z',
    source: 'test',
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    name: 'Woolworths',
    aliases: [],
    lastEditedTime: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePendingEntity(overrides: Partial<PendingEntity> = {}): PendingEntity {
  return {
    tempId: `temp:entity:${crypto.randomUUID()}`,
    name: 'New Merchant',
    type: 'company',
    ...overrides,
  };
}

describe('computeMergedRules', () => {
  it('returns dbRules unchanged (referential equality) when no pending ChangeSets', () => {
    const dbRules = [makeRule()];
    const result = computeMergedRules(dbRules, []);
    expect(result).toBe(dbRules);
  });

  it('applies a single add operation', () => {
    const dbRules = [makeRule()];
    const cs = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'coles',
            matchType: 'exact',
            entityId: 'entity-2',
            entityName: 'Coles',
            tags: [],
            confidence: 0.9,
          },
        },
      ],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(2);
    expect(elementAt(result, 1).descriptionPattern).toBe('COLES');
    expect(elementAt(result, 1).id).toMatch(/^temp:/);
  });

  it('applies a single edit operation', () => {
    const dbRules = [makeRule({ id: 'rule-1', confidence: 0.5 })];
    const cs = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.99 } }],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(1);
    expect(elementAt(result, 0).confidence).toBe(0.99);
  });

  it('applies multiple sequential ChangeSets (add then edit same rule)', () => {
    const dbRules: Correction[] = [];

    const cs1 = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'aldi',
            matchType: 'exact',
            entityId: 'entity-3',
            entityName: 'Aldi',
            tags: [],
            confidence: 0.8,
          },
        },
      ],
    });

    // cs2 must edit the temp id that cs1's add assigns, so read it back first.
    const intermediateResult = computeMergedRules(dbRules, [cs1]);
    const addedRuleId = elementAt(intermediateResult, 0).id;

    const cs2 = makePendingChangeSet({
      ops: [{ op: 'edit', id: addedRuleId, data: { confidence: 0.95 } }],
    });

    const result = computeMergedRules(dbRules, [cs1, cs2]);
    expect(result).toHaveLength(1);
    expect(elementAt(result, 0).confidence).toBe(0.95);
  });

  it('throws when a ChangeSet references a removed rule', () => {
    const dbRules = [makeRule({ id: 'rule-1' })];

    const cs1 = makePendingChangeSet({
      ops: [{ op: 'remove', id: 'rule-1' }],
    });

    const cs2 = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.5 } }],
    });

    expect(() => computeMergedRules(dbRules, [cs1, cs2])).toThrow();
  });

  it('handles mixed operations across ChangeSets', () => {
    const dbRules = [
      makeRule({ id: 'rule-1', descriptionPattern: 'WOOLWORTHS' }),
      makeRule({ id: 'rule-2', descriptionPattern: 'COLES' }),
    ];

    const cs = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'aldi',
            matchType: 'exact',
            entityId: 'entity-3',
            entityName: 'Aldi',
            tags: [],
            confidence: 0.8,
          },
        },
        { op: 'disable', id: 'rule-2' },
        { op: 'edit', id: 'rule-1', data: { confidence: 0.99 } },
      ],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(3);

    const rule1 = result.find((r) => r.id === 'rule-1');
    expect(rule1?.confidence).toBe(0.99);

    const rule2 = result.find((r) => r.id === 'rule-2');
    expect(rule2?.isActive).toBe(false);

    const addedRule = result.find((r) => r.id.startsWith('temp:'));
    expect(addedRule?.descriptionPattern).toBe('ALDI');
  });

  it('gives every pending add across separate ChangeSets a distinct temp id', () => {
    // Regression (#3596): each pending rule is its own single-`add` ChangeSet.
    // The fold applies one ChangeSet at a time, so a per-call counter that
    // restarted at `temp:1` made all pending rules collide on a single id —
    // clicking one in the rule manager then highlighted every one.
    const dbRules = [makeRule({ id: 'rule-1' })];
    const addOp = (descriptionPattern: string, entityName: string): ChangeSet['ops'][number] => ({
      op: 'add',
      data: { descriptionPattern, matchType: 'exact', entityName, tags: [], confidence: 0.8 },
    });
    const pending = [
      makePendingChangeSet({ ops: [addOp('aldi', 'Aldi')] }),
      makePendingChangeSet({ ops: [addOp('kmart', 'Kmart')] }),
      makePendingChangeSet({ ops: [addOp('bunnings', 'Bunnings')] }),
    ];

    const result = computeMergedRules(dbRules, pending);
    const pendingIds = result.filter((r) => r.id.startsWith('temp:')).map((r) => r.id);

    expect(pendingIds).toHaveLength(3);
    expect(new Set(pendingIds).size).toBe(3);
  });

  it('keeps temp ids unique when a single ChangeSet adds several rules', () => {
    const pending = [
      makePendingChangeSet({
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'aldi', matchType: 'exact', tags: [], confidence: 0.8 },
          },
          {
            op: 'add',
            data: { descriptionPattern: 'kmart', matchType: 'exact', tags: [], confidence: 0.8 },
          },
        ],
      }),
      makePendingChangeSet({
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'ikea', matchType: 'exact', tags: [], confidence: 0.8 },
          },
        ],
      }),
    ];

    const pendingIds = computeMergedRules([], pending)
      .filter((r) => r.id.startsWith('temp:'))
      .map((r) => r.id);

    expect(pendingIds).toHaveLength(3);
    expect(new Set(pendingIds).size).toBe(3);
  });

  it('is pure — same input refs recompute a fresh but equal output (no internal caching, CF082/#3670)', () => {
    const dbRules = [makeRule()];
    const pending = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.8 } }],
      }),
    ];

    const result1 = computeMergedRules(dbRules, pending);
    const result2 = computeMergedRules(dbRules, pending);
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  it('recomputes when input refs change', () => {
    const dbRules = [makeRule()];
    const pending1 = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.8 } }],
      }),
    ];
    const pending2 = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.9 } }],
      }),
    ];

    const result1 = computeMergedRules(dbRules, pending1);
    const result2 = computeMergedRules(dbRules, pending2);
    expect(result1).not.toBe(result2);
    expect(elementAt(result1, 0).confidence).toBe(0.8);
    expect(elementAt(result2, 0).confidence).toBe(0.9);
  });

  it('preserves tags as string[] (not a JSON-encoded string) after applying ops', () => {
    // Merged rules must expose tags as string[]: a leaked CorrectionRow (tags: string)
    // makes downstream edit ops send `tags: "[\"grocery\"]"` and fail server-side Zod validation.
    const dbRules = [makeRule({ id: 'r1', tags: ['grocery'] })];
    const cs = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'r1', data: { confidence: 0.9 } }],
    });
    const [merged] = computeMergedRules(dbRules, [cs]);
    expect(Array.isArray(merged?.tags)).toBe(true);
    expect(merged?.tags).toEqual(['grocery']);
  });
});

describe('computeMergedEntities', () => {
  it('returns dbEntities unchanged when no pending entities', () => {
    const dbEntities = [makeEntity()];
    const result = computeMergedEntities(dbEntities, []);
    expect(result).toBe(dbEntities);
  });

  it('merges pending entities alphabetically with DB entities', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths' })];
    const pending = [makePendingEntity({ name: 'Coles' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(2);
    expect(elementAt(result, 0).name).toBe('Coles');
    expect(elementAt(result, 0).id).toMatch(/^temp:entity:/);
    expect(elementAt(result, 1).name).toBe('Woolworths');
  });

  it('replaces DB entity when pending entity has same name', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths' })];
    const pending = [makePendingEntity({ name: 'Woolworths' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(1);
    expect(elementAt(result, 0).id).toMatch(/^temp:entity:/);
    expect(elementAt(result, 0).name).toBe('Woolworths');
  });

  it('handles multiple collisions', () => {
    const dbEntities = [
      makeEntity({ id: 'e1', name: 'Woolworths' }),
      makeEntity({ id: 'e2', name: 'Coles' }),
      makeEntity({ id: 'e3', name: 'Aldi' }),
    ];
    const pending = [
      makePendingEntity({ name: 'Woolworths' }),
      makePendingEntity({ name: 'Coles' }),
    ];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(3);
    expect(elementAt(result, 0).name).toBe('Aldi');
    expect(elementAt(result, 0).id).toBe('e3');
    expect(elementAt(result, 1).name).toBe('Coles');
    expect(elementAt(result, 1).id).toMatch(/^temp:entity:/);
    expect(elementAt(result, 2).name).toBe('Woolworths');
    expect(elementAt(result, 2).id).toMatch(/^temp:entity:/);
  });

  it('handles case-insensitive collision', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths' })];
    const pending = [makePendingEntity({ name: 'woolworths' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(1);
    expect(elementAt(result, 0).name).toBe('woolworths');
    expect(elementAt(result, 0).id).toMatch(/^temp:entity:/);
  });

  it('handles empty DB list with pending entities', () => {
    const pending = [
      makePendingEntity({ name: 'New Corp' }),
      makePendingEntity({ name: 'Another Corp' }),
    ];

    const result = computeMergedEntities([], pending);
    expect(result).toHaveLength(2);
    expect(elementAt(result, 0).name).toBe('Another Corp');
    expect(elementAt(result, 1).name).toBe('New Corp');
    expect(elementAt(result, 0).aliases).toEqual([]);
    expect(elementAt(result, 0).id).toMatch(/^temp:entity:/);
    // A fixed placeholder, never a wall-clock read — a `new Date()` here would
    // make computeMergedEntities impure (see the purity test below).
    expect(elementAt(result, 0).lastEditedTime).toBe('1970-01-01T00:00:00.000Z');
  });

  it('is pure — same input refs recompute a fresh but equal output (no internal caching, CF082/#3670)', () => {
    const dbEntities = [makeEntity()];
    const pending = [makePendingEntity()];

    const result1 = computeMergedEntities(dbEntities, pending);
    const result2 = computeMergedEntities(dbEntities, pending);
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  it('recomputes when input refs change', () => {
    const dbEntities = [makeEntity()];
    const pending1 = [makePendingEntity({ name: 'A' })];
    const pending2 = [makePendingEntity({ name: 'B' })];

    const result1 = computeMergedEntities(dbEntities, pending1);
    const result2 = computeMergedEntities(dbEntities, pending2);
    expect(result1).not.toBe(result2);
  });
});
