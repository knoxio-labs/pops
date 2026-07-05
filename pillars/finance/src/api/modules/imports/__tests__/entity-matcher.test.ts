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

describe('matchEntity — diacritic folding + broadened punctuation stripping (CF056)', () => {
  it('exact-matches an accented description against a plain-ASCII entity name', () => {
    const entityLookup = lookup([['cafe nero', { id: 'cafe-nero', name: 'Cafe Nero' }]]);

    const result = matchEntity('Café Nero', entityLookup, new Map());

    expect(result).toEqual({ entityName: 'Cafe Nero', entityId: 'cafe-nero', matchType: 'exact' });
  });

  it('exact-matches a plain-ASCII description against an accented entity name', () => {
    const entityLookup = lookup([['café nero', { id: 'cafe-nero', name: 'Café Nero' }]]);

    const result = matchEntity('CAFE NERO', entityLookup, new Map());

    expect(result).toEqual({ entityName: 'Café Nero', entityId: 'cafe-nero', matchType: 'exact' });
  });

  it('matches an accented alias against a folded (plain-ASCII) description', () => {
    const entityLookup = lookup([['nero group', { id: 'nero', name: 'Nero Group' }]]);
    const aliasMap = aliases([['café nero', 'Nero Group']]);

    const result = matchEntity('CAFE NERO SYDNEY', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'Nero Group', entityId: 'nero', matchType: 'alias' });
  });

  it('matches a plain-ASCII alias against an accented description', () => {
    const entityLookup = lookup([['nero group', { id: 'nero', name: 'Nero Group' }]]);
    const aliasMap = aliases([['cafe nero', 'Nero Group']]);

    const result = matchEntity('Café Nero Sydney', entityLookup, aliasMap);

    expect(result).toEqual({ entityName: 'Nero Group', entityId: 'nero', matchType: 'alias' });
  });

  it('matches a hyphenated description against a space-separated entity name via the punctuation-retry stage', () => {
    const entityLookup = lookup([['ww metro', { id: 'ww', name: 'WW Metro' }]]);

    const result = matchEntity('WW-METRO 1234', entityLookup, new Map());

    expect(result).toEqual({ entityName: 'WW Metro', entityId: 'ww', matchType: 'prefix' });
  });

  it('matches a bank description that dropped the ampersand against an entity name that kept it', () => {
    const entityLookup = lookup([['m&s food', { id: 'ms', name: 'M&S Food' }]]);

    const result = matchEntity('MS FOOD LONDON', entityLookup, new Map());

    expect(result).toEqual({ entityName: 'M&S Food', entityId: 'ms', matchType: 'prefix' });
  });

  it('matches a bank description that dropped the period against an entity name that kept it', () => {
    const entityLookup = lookup([['j.crew', { id: 'jc', name: 'J.Crew' }]]);

    const result = matchEntity('JCREW STORE 42', entityLookup, new Map());

    expect(result).toEqual({ entityName: 'J.Crew', entityId: 'jc', matchType: 'prefix' });
  });
});
