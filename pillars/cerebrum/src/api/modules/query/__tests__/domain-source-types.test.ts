import { describe, expect, it } from 'vitest';

import { CROSS_SOURCE_TYPES } from '../../thalamus/cross-source.js';
import { ALL_QUERY_DOMAINS, DOMAIN_SOURCE_TYPES, sourceTypesForDomains } from '../types.js';

const STORED_SOURCE_TYPES: readonly string[] = ['engram', ...CROSS_SOURCE_TYPES];

describe('sourceTypesForDomains', () => {
  it('selects both stored media source types for the media domain', () => {
    expect(sourceTypesForDomains(['media'])).toEqual(['movie', 'tv_show']);
  });

  it('concatenates the source types of several domains in order', () => {
    expect(sourceTypesForDomains(['transactions', 'media', 'engrams'])).toEqual([
      'transaction',
      'movie',
      'tv_show',
      'engram',
    ]);
  });

  it('returns nothing for no domains', () => {
    expect(sourceTypesForDomains([])).toEqual([]);
  });
});

describe('DOMAIN_SOURCE_TYPES', () => {
  it.each(ALL_QUERY_DOMAINS)(
    'maps %s only to source types embeddings are stored under',
    (domain) => {
      expect(DOMAIN_SOURCE_TYPES[domain].length).toBeGreaterThan(0);
      for (const sourceType of DOMAIN_SOURCE_TYPES[domain]) {
        expect(STORED_SOURCE_TYPES).toContain(sourceType);
      }
    }
  );

  it('reaches every stored source type from some domain', () => {
    expect([...sourceTypesForDomains(ALL_QUERY_DOMAINS)].toSorted()).toEqual(
      [...STORED_SOURCE_TYPES].toSorted()
    );
  });
});
