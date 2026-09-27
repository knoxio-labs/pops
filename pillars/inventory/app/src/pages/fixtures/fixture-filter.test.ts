import { describe, expect, it } from 'vitest';

import {
  fixtureFilterSearch,
  isFiltered,
  NO_FIXTURE_FILTER,
  parseFixtureFilter,
} from './fixture-filter.js';

describe('fixture filters', () => {
  it('preserves raw query text when serialising and trims only the parsed server value', () => {
    const params = new URLSearchParams('q=%20Desk%20&kind=power&tab=fixtures');

    expect(parseFixtureFilter(params)).toEqual({ query: 'Desk', kind: 'power' });
    expect(fixtureFilterSearch({ query: '  Desk  ', kind: 'power' })).toBe(
      '?q=++Desk++&kind=power'
    );
  });

  it('rejects unknown kinds and keeps the all-filter sentinel unfiltered', () => {
    expect(parseFixtureFilter(new URLSearchParams('kind=other'))).toEqual(NO_FIXTURE_FILTER);
    expect(isFiltered(NO_FIXTURE_FILTER)).toBe(false);
    expect(isFiltered({ query: '', kind: 'network' })).toBe(true);
  });
});
