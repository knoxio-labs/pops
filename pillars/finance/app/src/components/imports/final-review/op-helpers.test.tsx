import { describe, expect, it } from 'vitest';

import { MERGE_BADGE, OP_BADGE, tagRuleOpBadge, tagRuleOpDisplayLabel } from './op-helpers';

import type { TagRuleChangeSetOp } from './op-helpers';
import type { TagRuleAddCollision } from './useTagRuleAddCollisions';

const addOp = (tags: string[] = []): TagRuleChangeSetOp => ({
  op: 'add',
  data: { descriptionPattern: 'HUNGRY JACKS', tags },
});

const collision: TagRuleAddCollision = {
  ruleId: 'rule-1',
  existingTags: ['venue:cafe', 'occasion:birthday'],
};

describe('tagRuleOpBadge (POPS-2955)', () => {
  it('badges an add with no collision as ADD', () => {
    expect(tagRuleOpBadge(addOp(), null)).toBe(OP_BADGE.add);
  });

  it('badges an add with no resolved collision yet as ADD', () => {
    expect(tagRuleOpBadge(addOp(), undefined)).toBe(OP_BADGE.add);
  });

  it('badges an add that collides as MERGE, never as ADD', () => {
    const badge = tagRuleOpBadge(addOp(), collision);
    expect(badge).toBe(MERGE_BADGE);
    expect(badge).not.toBe(OP_BADGE.add);
  });

  it('badges a disable op by its own kind regardless of collision', () => {
    expect(tagRuleOpBadge({ op: 'disable', id: 'r1' }, null)).toBe(OP_BADGE.disable);
  });
});

describe('tagRuleOpDisplayLabel (POPS-2955)', () => {
  it('labels a plain add with its pattern and tags, saying nothing about merging', () => {
    const label = tagRuleOpDisplayLabel(addOp(['venue:cafe']), null);
    expect(label).toContain('HUNGRY JACKS');
    expect(label.toLowerCase()).not.toContain('existing');
  });

  it('labels a colliding add with the existing rule tags distinctly from a create', () => {
    const label = tagRuleOpDisplayLabel(addOp(['contains:coffee']), collision);
    expect(label).toContain('HUNGRY JACKS');
    expect(label).toMatch(/existing/i);
    // Both the rule's current tags and the incoming ones are visible — a
    // reviewer should not have to guess what the merge produces.
    expect(label).toContain('Cafe');
    expect(label).toContain('Coffee');
  });

  it('says the existing rule has no tags yet rather than rendering an empty list', () => {
    const label = tagRuleOpDisplayLabel(addOp(['venue:cafe']), {
      ruleId: 'rule-2',
      existingTags: [],
    });
    expect(label).toMatch(/no tags/i);
  });
});
