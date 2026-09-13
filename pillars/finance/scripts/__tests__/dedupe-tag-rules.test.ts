/**
 * The verdicts `dedupe-tag-rules.ts` reaches over active tag rules (POPS-3664).
 *
 * Pure tier: what counts as one cluster, which row survives a merge, and when a
 * disagreement may be written. The write half is covered next door.
 */
import { describe, expect, it } from 'vitest';

import { MarkerFacetTagRuleError } from '../../src/db/errors.js';
import {
  clusterKey,
  parseResolutions,
  planDedupe,
  type DedupePlan,
  type DedupeRule,
  type PatternBucket,
} from '../dedupe-tag-rules-plan.js';

function rule(id: string, overrides: Partial<DedupeRule> = {}): DedupeRule {
  return {
    id,
    entityId: 'entity-mcd',
    tags: ['venue:takeaway'],
    timesApplied: 0,
    createdAt: '2026-08-01 00:00:00',
    lastUsedAt: null,
    ...overrides,
  };
}

function bucket(rules: DedupeRule[], descriptionPattern = "MCDONALD'S"): PatternBucket {
  return { descriptionPattern, matchType: 'contains', rules };
}

function only(plans: DedupePlan[], kind: DedupePlan['kind']): DedupePlan[] {
  return plans.filter((plan) => plan.kind === kind);
}

describe('planDedupe', () => {
  it('leaves a single rule alone', () => {
    const { plans } = planDedupe([bucket([rule('r1')])]);
    expect(plans).toEqual([
      { kind: 'ok', key: clusterKey('contains', "MCDONALD'S", 'entity-mcd'), ruleId: 'r1' },
    ]);
  });

  it('merges identical tag sets onto the most-applied row, summing usage', () => {
    const { plans } = planDedupe([
      bucket([
        rule('r1', { timesApplied: 12, lastUsedAt: '2026-09-01' }),
        rule('r2', { timesApplied: 1, tags: [' venue:takeaway', 'venue:takeaway'] }),
        rule('r3', {
          timesApplied: 12,
          createdAt: '2026-07-01 00:00:00',
          lastUsedAt: '2026-09-10',
        }),
      ]),
    ]);

    expect(plans).toEqual([
      {
        kind: 'merge',
        key: clusterKey('contains', "MCDONALD'S", 'entity-mcd'),
        keepId: 'r3',
        removeIds: ['r1', 'r2'],
        tags: ['venue:takeaway'],
        timesApplied: 25,
        lastUsedAt: '2026-09-10',
      },
    ]);
  });

  it('treats tag order as irrelevant to whether two rules agree', () => {
    const { plans } = planDedupe([
      bucket([
        rule('r1', { tags: ['channel:online', 'enrich:amazon'] }),
        rule('r2', { tags: ['enrich:amazon', 'channel:online'] }),
      ]),
    ]);
    expect(plans.map((plan) => plan.kind)).toEqual(['merge']);
  });

  it('surfaces disagreeing tag sets as an unresolved conflict and plans no write', () => {
    const { plans } = planDedupe([
      bucket([
        rule('r1', { tags: ['occasion:out', 'venue:bottle-shop'] }),
        rule('r2', { tags: ['occasion:home'] }),
      ]),
    ]);

    expect(plans).toEqual([
      {
        kind: 'conflict',
        key: clusterKey('contains', "MCDONALD'S", 'entity-mcd'),
        rules: [
          { id: 'r1', tags: ['occasion:out', 'venue:bottle-shop'], timesApplied: 0 },
          { id: 'r2', tags: ['occasion:home'], timesApplied: 0 },
        ],
        resolution: null,
      },
    ]);
  });

  it('resolves a conflict to the chosen tag set when the resolutions name its key', () => {
    const key = clusterKey('contains', "MCDONALD'S", 'entity-mcd');
    const { plans, unusedResolutionKeys } = planDedupe(
      [
        bucket([
          rule('r1', { tags: ['occasion:out'], timesApplied: 2 }),
          rule('r2', { tags: ['occasion:home'], timesApplied: 5 }),
        ]),
      ],
      new Map([[key, ['occasion:home', 'venue:bottle-shop']]])
    );

    expect(unusedResolutionKeys).toEqual([]);
    expect(plans[0]).toMatchObject({
      kind: 'conflict',
      resolution: {
        keepId: 'r2',
        removeIds: ['r1'],
        tags: ['occasion:home', 'venue:bottle-shop'],
        timesApplied: 7,
      },
    });
  });

  it('deletes temp-scoped rows and does not let them form a cluster with the real rule', () => {
    const { plans } = planDedupe([
      bucket([
        rule('real', { tags: ['venue:supermarket'] }),
        rule('leak', { entityId: 'temp:entity:9a1f', tags: ['contains:groceries'] }),
      ]),
    ]);

    expect(only(plans, 'delete-temp-scope')).toEqual([
      {
        kind: 'delete-temp-scope',
        ruleId: 'leak',
        entityId: 'temp:entity:9a1f',
        descriptionPattern: "MCDONALD'S",
      },
    ]);
    expect(only(plans, 'ok')).toHaveLength(1);
    expect(only(plans, 'conflict')).toHaveLength(0);
  });

  it('keeps rules for different entities, and global versus scoped, as separate clusters', () => {
    const { plans } = planDedupe([
      bucket([
        rule('woolies-a', { entityId: 'entity-a', tags: ['contains:groceries'] }),
        rule('woolies-b', { entityId: 'entity-b', tags: ['contains:groceries'] }),
        rule('woolies-global', { entityId: null, tags: ['venue:supermarket'] }),
      ]),
    ]);

    expect(plans.map((plan) => plan.kind)).toEqual(['ok', 'ok', 'ok']);
  });

  it('reports a resolution key that names no conflict', () => {
    const { unusedResolutionKeys } = planDedupe(
      [bucket([rule('r1'), rule('r2')])],
      new Map([
        [clusterKey('contains', "MCDONALD'S", 'entity-mcd'), ['venue:takeaway']],
        ['contains|NOPE|*', ['venue:pub']],
      ])
    );
    expect(unusedResolutionKeys).toEqual([
      clusterKey('contains', "MCDONALD'S", 'entity-mcd'),
      'contains|NOPE|*',
    ]);
  });
});

describe('parseResolutions', () => {
  it('reads a key -> tags object', () => {
    expect([...parseResolutions({ 'contains|AMPOL|*': ['venue:fuel'] })]).toEqual([
      ['contains|AMPOL|*', ['venue:fuel']],
    ]);
  });

  it.each([[[]], [['']], [[1]], ['venue:fuel']])('refuses a malformed value %j', (value) => {
    expect(() => parseResolutions({ 'contains|AMPOL|*': value })).toThrow(/non-empty array/);
  });

  it('refuses a non-object file', () => {
    expect(() => parseResolutions([['contains|AMPOL|*', ['venue:fuel']]])).toThrow(/JSON object/);
  });

  it('refuses a resolution that would write a marker tag', () => {
    expect(() => parseResolutions({ 'contains|AMPOL|*': ['flag:needs-review'] })).toThrow(
      MarkerFacetTagRuleError
    );
  });
});
