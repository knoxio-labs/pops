import { describe, expect, it } from 'vitest';

import { buildKnownEntityHint } from '../entity-vocabulary.js';

import type { EntityLookupMap } from '../entity-matcher.js';

function makeLookup(names: string[]): EntityLookupMap {
  const map = new Map();
  names.forEach((name, i) => map.set(name.toLowerCase(), { id: `ent_${i}`, name }));
  return map;
}

describe('buildKnownEntityHint', () => {
  it('returns the entity names, alphabetically sorted', () => {
    const hint = buildKnownEntityHint(makeLookup(['Woolworths', 'Aldi', 'Coles']));
    expect(hint).toEqual(['Aldi', 'Coles', 'Woolworths']);
  });

  it('returns an empty list for an empty lookup', () => {
    expect(buildKnownEntityHint(makeLookup([]))).toEqual([]);
  });

  it('dedupes entity names that appear under multiple lookup keys', () => {
    const lookup: EntityLookupMap = new Map([
      ['woolworths', { id: 'ent_1', name: 'Woolworths' }],
      ['woolworths metro', { id: 'ent_1', name: 'Woolworths' }],
    ]);
    expect(buildKnownEntityHint(lookup)).toEqual(['Woolworths']);
  });

  it('caps the list at 60 entities', () => {
    const names = Array.from({ length: 200 }, (_, i) => `Entity ${String(i).padStart(3, '0')}`);
    const hint = buildKnownEntityHint(makeLookup(names));
    expect(hint.length).toBeLessThanOrEqual(60);
  });

  it('caps the list well before 1000 rendered characters', () => {
    const names = Array.from({ length: 500 }, (_, i) => `A Very Long Entity Name Number ${i}`);
    const hint = buildKnownEntityHint(makeLookup(names));
    const rendered = hint.join(', ');
    expect(rendered.length).toBeLessThanOrEqual(1000);
  });
});
