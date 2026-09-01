import { describe, expect, it } from 'vitest';

import {
  composeTag,
  describeTag,
  formatFacet,
  formatTagValue,
  groupTagsByFacet,
  hasTagValue,
  orderTagsByFacet,
  parseTag,
  planTagCreation,
  rankTagSuggestions,
  resolveTypedTag,
  slugifyTagValue,
  tagColorKey,
} from './tags';

const FACETS = [
  { facet: 'venue', kind: 'closed' },
  { facet: 'contains', kind: 'open' },
  { facet: 'trip', kind: 'open' },
  { facet: 'flag', kind: 'marker' },
] as const;

describe('parseTag', () => {
  it('splits a prefixed tag into facet and value', () => {
    expect(parseTag('venue:bar')).toEqual({ facet: 'venue', value: 'bar', raw: 'venue:bar' });
  });

  it('treats an unprefixed tag as unfaceted, keeping the whole string as the value', () => {
    expect(parseTag('Groceries')).toEqual({ facet: null, value: 'Groceries', raw: 'Groceries' });
  });

  it('handles the empty string without throwing', () => {
    expect(parseTag('')).toEqual({ facet: null, value: '', raw: '' });
  });

  it('splits on the first separator only, so a value may contain a colon', () => {
    expect(parseTag('note:see:also')).toEqual({
      facet: 'note',
      value: 'see:also',
      raw: 'note:see:also',
    });
  });

  it('treats a leading separator as unfaceted rather than an empty facet', () => {
    expect(parseTag(':bar')).toEqual({ facet: null, value: ':bar', raw: ':bar' });
  });

  it('treats a trailing separator as unfaceted rather than an empty value', () => {
    expect(parseTag('venue:')).toEqual({ facet: null, value: 'venue:', raw: 'venue:' });
  });
});

describe('formatTagValue', () => {
  it('sentence-cases a hyphenated value', () => {
    expect(formatTagValue(parseTag('contains:party-supplies'))).toBe('Party supplies');
  });

  it('sentence-cases an underscored value', () => {
    expect(formatTagValue(parseTag('contains:party_supplies'))).toBe('Party supplies');
  });

  it('leaves an already-capitalised unfaceted tag alone', () => {
    expect(formatTagValue(parseTag('Groceries'))).toBe('Groceries');
  });

  it('falls back to the bare value, never the prefix, when it formats to nothing', () => {
    expect(formatTagValue(parseTag('venue:-'))).toBe('-');
  });

  it('does not invent a friendlier label for a value it does not recognise', () => {
    expect(formatTagValue(parseTag('occasion:out'))).toBe('Out');
  });
});

describe('formatFacet', () => {
  it('sentence-cases a facet', () => {
    expect(formatFacet('venue')).toBe('Venue');
  });

  it('labels the unfaceted bucket', () => {
    expect(formatFacet(null)).toBe('Other');
  });
});

describe('tagColorKey', () => {
  it('colours faceted tags by their axis, so one axis reads as one axis', () => {
    expect(tagColorKey(parseTag('venue:bar'))).toBe(tagColorKey(parseTag('venue:cafe')));
  });

  it('gives different axes different keys', () => {
    expect(tagColorKey(parseTag('venue:bar'))).not.toBe(tagColorKey(parseTag('contains:bar')));
  });

  it('falls back to the whole string for an unfaceted tag', () => {
    expect(tagColorKey(parseTag('Groceries'))).toBe('Groceries');
  });
});

describe('describeTag', () => {
  it('names the facet in the accessible label so colour is not the only cue', () => {
    expect(describeTag('venue:bar').ariaLabel).toBe('Venue: Bar');
  });

  it('omits the facet from the accessible label of an unfaceted tag', () => {
    expect(describeTag('Groceries').ariaLabel).toBe('Groceries');
  });

  it('keeps the stored string in the tooltip', () => {
    expect(describeTag('venue:bar').title).toContain('venue:bar');
  });

  it('keeps the stored string in the tooltip alongside caller context', () => {
    const { title } = describeTag('venue:bar', 'Rule: "PUB"');
    expect(title).toContain('Rule: "PUB"');
    expect(title).toContain('venue:bar');
  });

  it('never shows the prefix in the visible label', () => {
    expect(describeTag('venue:bar').label).toBe('Bar');
  });
});

describe('groupTagsByFacet', () => {
  it('buckets tags by axis, alphabetically, with the unfaceted bucket last', () => {
    const groups = groupTagsByFacet(['venue:bar', 'Legacy', 'occasion:out', 'contains:alcohol']);
    expect(groups.map((group) => group.label)).toEqual(['Contains', 'Occasion', 'Venue', 'Other']);
    expect(groups.at(-1)?.facet).toBeNull();
  });

  it('preserves the caller ordering within a bucket', () => {
    const groups = groupTagsByFacet(['venue:pub', 'venue:bar', 'venue:cafe']);
    expect(groups[0]?.tags.map((tag) => tag.value)).toEqual(['pub', 'bar', 'cafe']);
  });

  it('omits the unfaceted bucket when every tag is faceted', () => {
    const groups = groupTagsByFacet(['venue:bar']);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.facet).toBe('venue');
  });

  it('returns nothing for an empty list', () => {
    expect(groupTagsByFacet([])).toEqual([]);
  });
});

describe('orderTagsByFacet', () => {
  it('flattens the groups, so the same axis lands in the same place on every row', () => {
    expect(orderTagsByFacet(['venue:bar', 'contains:alcohol']).map((tag) => tag.raw)).toEqual([
      'contains:alcohol',
      'venue:bar',
    ]);
    expect(orderTagsByFacet(['contains:alcohol', 'venue:bar']).map((tag) => tag.raw)).toEqual([
      'contains:alcohol',
      'venue:bar',
    ]);
  });

  it('keeps every tag', () => {
    const tags = ['venue:bar', 'Legacy', 'occasion:out'];
    expect(orderTagsByFacet(tags)).toHaveLength(tags.length);
  });
});

describe('resolveTypedTag', () => {
  const vocabulary = ['venue:bar', 'contains:party-supplies', 'Legacy'];

  it('resolves the stored string', () => {
    expect(resolveTypedTag('venue:bar', vocabulary)).toBe('venue:bar');
  });

  it('resolves what the picker displays, so typing the visible label reuses the tag', () => {
    expect(resolveTypedTag('bar', vocabulary)).toBe('venue:bar');
    expect(resolveTypedTag('Bar', vocabulary)).toBe('venue:bar');
  });

  it('resolves the sentence-cased label of a hyphenated value', () => {
    expect(resolveTypedTag('Party supplies', vocabulary)).toBe('contains:party-supplies');
    expect(resolveTypedTag('party-supplies', vocabulary)).toBe('contains:party-supplies');
  });

  it('resolves an unfaceted tag', () => {
    expect(resolveTypedTag('legacy', vocabulary)).toBe('Legacy');
  });

  it('refuses to guess when two axes share a value', () => {
    expect(resolveTypedTag('bar', ['venue:bar', 'contains:bar'])).toBeUndefined();
  });

  it('still resolves an ambiguous value when the stored string is typed in full', () => {
    expect(resolveTypedTag('contains:bar', ['venue:bar', 'contains:bar'])).toBe('contains:bar');
  });

  it('returns nothing for a value the vocabulary does not carry', () => {
    expect(resolveTypedTag('brand new', vocabulary)).toBeUndefined();
  });

  it('returns nothing for blank input', () => {
    expect(resolveTypedTag('   ', vocabulary)).toBeUndefined();
  });
});

describe('hasTagValue', () => {
  it('matches a tag on both its facet and its value', () => {
    expect(hasTagValue(['venue:cafe', 'channel:online'], 'channel', 'online')).toBe(true);
  });

  it('rejects the same value under a different facet', () => {
    expect(hasTagValue(['project:online'], 'channel', 'online')).toBe(false);
  });

  it('rejects a different value under the same facet', () => {
    expect(hasTagValue(['channel:in-person'], 'channel', 'online')).toBe(false);
  });

  it('rejects the legacy unfaceted tag the namespace migration replaced', () => {
    expect(hasTagValue(['Online'], 'channel', 'online')).toBe(false);
  });

  it('ignores casing on both sides', () => {
    expect(hasTagValue(['Channel:Online'], 'channel', 'online')).toBe(true);
  });

  it('is false for an empty tag list', () => {
    expect(hasTagValue([], 'channel', 'online')).toBe(false);
  });
});

describe('rankTagSuggestions', () => {
  it('returns the unselected vocabulary in order when nothing is typed', () => {
    expect(rankTagSuggestions('', ['venue:bar', 'venue:cafe'], ['venue:bar'])).toEqual([
      'venue:cafe',
    ]);
  });

  it('ranks prefix matches ahead of substring matches', () => {
    expect(rankTagSuggestions('ca', ['venue:cafe', 'cafeteria', 'candy'], [])).toEqual([
      'cafeteria',
      'candy',
      'venue:cafe',
    ]);
  });

  it('preserves the vocabulary order within each rank', () => {
    expect(rankTagSuggestions('a', ['ant', 'bat', 'ape', 'cab'], [])).toEqual([
      'ant',
      'ape',
      'bat',
      'cab',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(rankTagSuggestions('BA', ['venue:bar'], [])).toEqual(['venue:bar']);
  });

  it('never offers a tag that is already selected', () => {
    expect(rankTagSuggestions('bar', ['venue:bar'], ['venue:bar'])).toEqual([]);
  });

  it('returns nothing when no tag contains the input', () => {
    expect(rankTagSuggestions('zzz', ['venue:bar'], [])).toEqual([]);
  });

  it('does not cap the result, leaving the display limit to the caller', () => {
    const available = Array.from({ length: 30 }, (_, i) => `venue:v${String(i)}`);

    expect(rankTagSuggestions('venue', available, [])).toHaveLength(30);
  });
});

describe('slugifyTagValue', () => {
  it('lower-cases and hyphenates what was typed', () => {
    expect(slugifyTagValue('Cairns 2026')).toBe('cairns-2026');
  });

  it('folds accents rather than dropping them', () => {
    expect(slugifyTagValue('Café')).toBe('cafe');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugifyTagValue('  gift — card  ')).toBe('gift-card');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugifyTagValue('-tolls-')).toBe('tolls');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugifyTagValue('!!!')).toBe('');
  });

  it('leaves an already-slugged value alone', () => {
    expect(slugifyTagValue('hunter-valley')).toBe('hunter-valley');
  });
});

describe('composeTag', () => {
  it('joins an axis and a value with the stored separator', () => {
    expect(composeTag('trip', 'cairns-2026')).toBe('trip:cairns-2026');
  });
});

describe('planTagCreation', () => {
  it('asks which axis a bare value belongs to, offering only the open ones', () => {
    expect(planTagCreation('Cairns 2026', FACETS)).toEqual({
      kind: 'choose',
      value: 'cairns-2026',
      facets: ['contains', 'trip'],
    });
  });

  it('is ready when the typed text already names an open axis', () => {
    expect(planTagCreation('trip:Cairns 2026', FACETS)).toEqual({
      kind: 'ready',
      tag: 'trip:cairns-2026',
    });
  });

  it('refuses a closed axis instead of offering to create the value', () => {
    expect(planTagCreation('venue:speakeasy', FACETS)).toEqual({
      kind: 'refused',
      facet: 'venue',
      facetKind: 'closed',
    });
  });

  it("refuses a marker axis, which is the system's to write", () => {
    expect(planTagCreation('flag:needs-review', FACETS)).toEqual({
      kind: 'refused',
      facet: 'flag',
      facetKind: 'marker',
    });
  });

  it('treats an unrecognised prefix as part of the value, not as a new axis', () => {
    expect(planTagCreation('4:30 coffee', FACETS)).toEqual({
      kind: 'choose',
      value: '4-30-coffee',
      facets: ['contains', 'trip'],
    });
  });

  it('creates nothing from an empty input', () => {
    expect(planTagCreation('   ', FACETS)).toEqual({ kind: 'none' });
  });

  it('creates nothing when no character survives slugging', () => {
    expect(planTagCreation('!!!', FACETS)).toEqual({ kind: 'none' });
  });

  it('creates nothing when an open axis is named with no value left', () => {
    expect(planTagCreation('trip:!!!', FACETS)).toEqual({ kind: 'none' });
  });

  it('offers nothing to choose from when the taxonomy has no open axis', () => {
    expect(planTagCreation('Cairns 2026', [{ facet: 'venue', kind: 'closed' }])).toEqual({
      kind: 'none',
    });
  });
});
