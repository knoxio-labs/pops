import { describe, expect, it } from 'vitest';

import {
  describeTag,
  formatFacet,
  formatTagValue,
  groupTagsByFacet,
  orderTagsByFacet,
  parseTag,
  tagColorKey,
} from './tags';

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
