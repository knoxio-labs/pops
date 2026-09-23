import { describe, expect, it } from 'vitest';

import { ComputedValueCache } from '../expression-cache.js';

import type { ComputedCacheSubject } from '../expression-cache.js';
import type { EffectiveComputedValue } from '../expression-types.js';

function subject(itemId: string, fieldId = 'total'): ComputedCacheSubject {
  return { itemId, fieldId, itemRevision: 3, catalogueRevision: 12 };
}

function computed(itemId: string, revision: number): EffectiveComputedValue {
  return {
    state: 'value',
    values: ['48.000'],
    provenance: {
      source: 'computed',
      catalogueRevision: 12,
      dependencies: [{ itemId, fieldId: 'price', revision }],
    },
  };
}

describe('ComputedValueCache', () => {
  it('hits only when item, catalogue and every dependency revision match', () => {
    const cache = new ComputedValueCache(2);
    cache.set(subject('package'), computed('unit', 7));

    expect(cache.get(subject('package'), () => 7)).toEqual(computed('unit', 7));
    expect(cache.get({ ...subject('package'), itemRevision: 4 }, () => 7)).toBeUndefined();
    expect(cache.size).toBe(0);

    cache.set(subject('package'), computed('unit', 7));
    expect(cache.get(subject('package'), () => 8)).toBeUndefined();
  });

  it('invalidates reverse dependencies, subjects and catalogue revisions directly', () => {
    const cache = new ComputedValueCache(4);
    cache.set(subject('first'), computed('unit', 7));
    cache.set(subject('second'), computed('unit', 7));
    cache.invalidateDependency('unit', 'price');
    expect(cache.size).toBe(0);

    cache.set(subject('first'), computed('unit', 7));
    cache.set(subject('second'), computed('first', 2));
    cache.invalidateItem('first');
    expect(cache.size).toBe(0);
    cache.set(subject('second'), computed('other', 2));
    cache.invalidateCatalogue(12);
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry without consulting a clock', () => {
    const cache = new ComputedValueCache(2);
    cache.set(subject('first'), computed('unit-a', 1));
    cache.set(subject('second'), computed('unit-b', 1));
    expect(cache.get(subject('first'), () => 1)).toBeDefined();
    cache.set(subject('third'), computed('unit-c', 1));

    expect(cache.get(subject('second'), () => 1)).toBeUndefined();
    expect(cache.get(subject('first'), () => 1)).toBeDefined();
    expect(cache.get(subject('third'), () => 1)).toBeDefined();
  });

  it('does not permit an unbounded or empty cache', () => {
    expect(() => new ComputedValueCache(0)).toThrowError(RangeError);
    expect(() => new ComputedValueCache(Number.POSITIVE_INFINITY)).toThrowError(RangeError);
  });
});
