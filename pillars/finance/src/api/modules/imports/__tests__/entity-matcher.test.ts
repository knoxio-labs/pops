/**
 * Regression tests for CF023 (#3629): the alias stage must not let a
 * short/generic alias hijack a better match, and when several aliases match
 * the same description the longest (most specific) alias key must win rather
 * than whichever came first in `Map` iteration order.
 */
import { describe, expect, it } from 'vitest';

import { matchEntity, type AliasMap, type EntityLookupMap } from '../entity-matcher.js';

function lookup(entries: [string, { id: string; name: string }][]): EntityLookupMap {
  return new Map(entries);
}

function aliases(entries: [string, string][]): AliasMap {
  return new Map(entries);
}

describe('matchEntity — alias stage guards (CF023)', () => {
  it('skips an alias shorter than the minimum length', () => {
    const entityLookup = lookup([['woolworths', { id: 'ww', name: 'Woolworths' }]]);
    const aliasMap = aliases([['ww', 'Woolworths']]);

    const result = matchEntity('WW METRO 1234', entityLookup, aliasMap);

    expect(result).toBeNull();
  });

  it('matches an alias at or above the minimum length', () => {
    const entityLookup = lookup([['woolworths', { id: 'ww', name: 'Woolworths' }]]);
    const aliasMap = aliases([['woolies', 'Woolworths']]);

    const result = matchEntity('WOOLIES METRO 1234', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'Woolworths', entityId: 'ww', matchType: 'alias' });
  });

  it('prefers the longest matching alias over a shorter generic one (longest wins)', () => {
    const entityLookup = lookup([
      ['acme fitness', { id: 'gym', name: 'Acme Fitness' }],
      ['acme', { id: 'generic', name: 'Acme Holdings' }],
    ]);
    // "acme" (a short/generic 4-char alias) and "acme fitness gym" (a longer,
    // more specific alias) both appear as substrings of the description —
    // the longer, more specific one must win regardless of Map iteration
    // order.
    const aliasMap = aliases([
      ['acme', 'Acme Holdings'],
      ['acme fitness gym', 'Acme Fitness'],
    ]);

    const result = matchEntity('ACME FITNESS GYM MEMBERSHIP', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'Acme Fitness', entityId: 'gym', matchType: 'alias' });
  });

  it('longest-wins is independent of Map insertion order', () => {
    const entityLookup = lookup([
      ['acme fitness', { id: 'gym', name: 'Acme Fitness' }],
      ['acme', { id: 'generic', name: 'Acme Holdings' }],
    ]);
    const aliasMap = aliases([
      ['acme fitness gym', 'Acme Fitness'],
      ['acme', 'Acme Holdings'],
    ]);

    const result = matchEntity('ACME FITNESS GYM MEMBERSHIP', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'Acme Fitness', entityId: 'gym', matchType: 'alias' });
  });

  it('falls through to the exact/prefix/contains stages when no alias meets the length floor', () => {
    const entityLookup = lookup([['ikea', { id: 'ikea', name: 'IKEA' }]]);
    const aliasMap = aliases([['ike', 'IKEA']]);

    const result = matchEntity('IKEA HOMEWARES', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'IKEA', entityId: 'ikea', matchType: 'prefix' });
  });
});
