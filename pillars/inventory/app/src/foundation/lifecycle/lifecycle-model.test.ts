import { describe, expect, it } from 'vitest';

import {
  actCopy,
  confirmLabel,
  isReversible,
  lifecycleActs,
  quantityProblem,
  reasonReady,
  restoreLabel,
  splitProblem,
} from './lifecycle-model';

describe('lifecycleActs', () => {
  it('offers every act but restore to an active item, destroy last', () => {
    expect(lifecycleActs('active')).toEqual(['retire', 'lost', 'discard', 'destroy']);
  });

  it('offers restore first to every inactive but terminal lifecycle', () => {
    expect(lifecycleActs('retired')[0]).toBe('restore');
    expect(lifecycleActs('discarded')[0]).toBe('restore');
    expect(lifecycleActs('lost')[0]).toBe('restore');
  });

  it('offers nothing once destroyed', () => {
    expect(lifecycleActs('destroyed')).toEqual([]);
  });

  it('never offers retire again to a retired item, or lost to a lost one', () => {
    expect(lifecycleActs('retired')).not.toContain('retire');
    expect(lifecycleActs('lost')).not.toContain('lost');
    expect(lifecycleActs('discarded')).not.toContain('discard');
  });
});

describe('actCopy', () => {
  it('keeps the verb, concept, presets, and requirement together', () => {
    expect(actCopy('retire')).toEqual({
      verb: 'Retire',
      concept: 'retired',
      reasons: ['No longer used', 'Replaced', 'Kept for parts', 'Other'],
      reasonRequired: false,
    });
    expect(actCopy('discard')).toEqual({
      verb: 'Discard',
      concept: 'discarded',
      reasons: ['Broken', 'Gave away', 'Sold', 'Thrown out', 'Other'],
      reasonRequired: true,
    });
    expect(actCopy('restore')).toEqual({
      verb: 'Restore',
      concept: 'undo',
      reasons: [],
      reasonRequired: false,
    });
  });
});

describe('isReversible', () => {
  it('treats destroy as the only irreversible act', () => {
    expect(isReversible('destroy')).toBe(false);
    for (const act of ['retire', 'lost', 'discard', 'restore'] as const) {
      expect(isReversible(act)).toBe(true);
    }
  });
});

describe('restoreLabel', () => {
  it('says Found it for a lost item and Restore otherwise', () => {
    expect(restoreLabel('lost')).toBe('Found it');
    expect(restoreLabel('discarded')).toBe('Restore');
    expect(restoreLabel('retired')).toBe('Restore');
  });
});

describe('confirmLabel', () => {
  it('names one item', () => {
    expect(confirmLabel('discard', 'Bluetooth speaker')).toBe('Discard Bluetooth speaker');
  });

  it('counts several items, singular for one', () => {
    expect(confirmLabel('retire', 14)).toBe('Retire 14 items');
    expect(confirmLabel('retire', 1)).toBe('Retire 1 item');
  });
});

describe('reasonReady', () => {
  it('lets an optional reason be skipped but not a required one', () => {
    expect(reasonReady('retire', null, '')).toBe(true);
    expect(reasonReady('discard', null, '')).toBe(false);
  });

  it('requires text when Other is chosen', () => {
    expect(reasonReady('discard', 'Other', '  ')).toBe(false);
    expect(reasonReady('discard', 'Other', 'Donated')).toBe(true);
    expect(reasonReady('discard', 'Broken', '')).toBe(true);
  });
});

describe('splitProblem', () => {
  it('accepts any split that leaves at least one behind', () => {
    expect(splitProblem(3, 1)).toBeNull();
    expect(splitProblem(3, 2)).toBeNull();
  });

  it('refuses splitting everything off, nothing, fractions, or a single item', () => {
    expect(splitProblem(3, 3)).toBe('Split off at most 2, so at least 1 stays here.');
    expect(splitProblem(3, 0)).toBe('Split off at least 1.');
    expect(splitProblem(3, 1.5)).toBe('Split off at least 1.');
    expect(splitProblem(1, 1)).toBe('Only a group of two or more can be split.');
  });
});

describe('quantityProblem', () => {
  it('accepts a different whole number of at least one', () => {
    expect(quantityProblem(3, 5, false)).toBeNull();
    expect(quantityProblem(3, 1, false)).toBeNull();
  });

  it('refuses zero, fractions, no change and any container', () => {
    expect(quantityProblem(3, 0, false)).toMatch(/^At least 1/);
    expect(quantityProblem(3, 2.5, false)).toBe('Use a whole number.');
    expect(quantityProblem(3, 3, false)).toBe('That is the current quantity.');
    expect(quantityProblem(1, 2, true)).toBe('A container is always one thing.');
  });
});
