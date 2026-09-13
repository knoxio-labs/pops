import { describe, expect, it } from 'vitest';

import { splitTag, vocabularyTags } from './tags';

describe('splitTag', () => {
  it('splits a faceted tag at its separator', () => {
    expect(splitTag('venue:pub')).toEqual({ facet: 'venue', value: 'pub' });
  });

  it('gives a bare tag no facet', () => {
    expect(splitTag('subscriptions')).toEqual({ facet: null, value: 'subscriptions' });
  });

  it('splits at the first separator, keeping any later one in the value', () => {
    expect(splitTag('note:10:30 meeting')).toEqual({ facet: 'note', value: '10:30 meeting' });
  });

  it('keeps an empty value rather than inventing one', () => {
    expect(splitTag('venue:')).toEqual({ facet: 'venue', value: '' });
  });
});

describe('vocabularyTags', () => {
  it('covers every case the Tags page has to show', () => {
    expect(vocabularyTags.some((tag) => tag.rules.length > 1 && tag.merchants.length > 1)).toBe(
      true
    );
    expect(vocabularyTags.some((tag) => tag.rules.length === 0 && tag.merchants.length > 0)).toBe(
      true
    );
    expect(vocabularyTags.some((tag) => tag.rules.length === 0 && tag.merchants.length === 0)).toBe(
      true
    );
    expect(vocabularyTags.some((tag) => tag.transactionCount === 0)).toBe(true);
    expect(vocabularyTags.some((tag) => tag.rules.some((rule) => !rule.isActive))).toBe(true);
  });

  it('holds each tag once', () => {
    const tags = vocabularyTags.map((tag) => tag.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
