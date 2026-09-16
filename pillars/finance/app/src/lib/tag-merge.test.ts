import { describe, expect, it } from 'vitest';

import { mergeTagsReplacingSingleValued } from './tag-merge';

describe('mergeTagsReplacingSingleValued', () => {
  it('replaces the value on a single-valued facet instead of adding a second', () => {
    expect(
      mergeTagsReplacingSingleValued(['venue:takeaway', 'contains:food'], ['venue:restaurant'])
    ).toEqual(['contains:food', 'venue:restaurant']);
  });

  it('unions a multi-valued facet', () => {
    expect(mergeTagsReplacingSingleValued(['contains:food'], ['contains:alcohol'])).toEqual([
      'contains:food',
      'contains:alcohol',
    ]);
  });

  it('keeps the first incoming value when incoming itself names two on one facet', () => {
    expect(mergeTagsReplacingSingleValued([], ['venue:pub', 'venue:club'])).toEqual(['venue:pub']);
  });

  it('leaves the row unchanged when the incoming value is already there', () => {
    expect(mergeTagsReplacingSingleValued(['venue:pub', 'occasion:out'], ['venue:pub'])).toEqual([
      'venue:pub',
      'occasion:out',
    ]);
  });

  it('adds a single value to a row with none on that facet', () => {
    expect(mergeTagsReplacingSingleValued(['contains:food'], ['venue:pub'])).toEqual([
      'contains:food',
      'venue:pub',
    ]);
  });

  it('unions unfaceted tags', () => {
    expect(mergeTagsReplacingSingleValued(['legacy'], ['other'])).toEqual(['legacy', 'other']);
  });
});
