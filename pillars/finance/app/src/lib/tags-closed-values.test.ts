/**
 * The stage-time half of the closed-namespace rule (POPS-3106). The commit
 * already refuses a value a closed axis does not hold; this is the same
 * question asked while the tag can still be changed, so it must agree with the
 * server on every case the server decides.
 */
import { describe, expect, it } from 'vitest';

import { closedValuesOutsideVocabulary, withoutMarkerTags, type TagFacetOption } from './tags';

const facets: TagFacetOption[] = [
  { facet: 'venue', kind: 'closed' },
  { facet: 'occasion', kind: 'closed' },
  { facet: 'trip', kind: 'open' },
  { facet: 'flag', kind: 'marker' },
];
const vocabulary = ['venue:bar', 'venue:pub', 'occasion:birthday'];

describe('closedValuesOutsideVocabulary', () => {
  it('refuses a closed-axis value the vocabulary does not hold', () => {
    expect(closedValuesOutsideVocabulary(['venue:speakeasy'], facets, vocabulary)).toEqual([
      'venue:speakeasy',
    ]);
  });

  it('accepts a closed-axis value the vocabulary holds, whatever its casing and padding', () => {
    expect(closedValuesOutsideVocabulary([' Venue:PUB '], facets, vocabulary)).toEqual([]);
  });

  it('never refuses an open axis, a marker axis, or a facet the taxonomy does not list', () => {
    expect(
      closedValuesOutsideVocabulary(
        ['trip:cairns-2026', 'flag:needs-review', 'mood:cheerful'],
        facets,
        vocabulary
      )
    ).toEqual([]);
  });

  it('never refuses an unfaceted tag', () => {
    expect(closedValuesOutsideVocabulary(['Groceries'], facets, vocabulary)).toEqual([]);
  });

  it('lists each refused tag once, in the order the rule carries them', () => {
    expect(
      closedValuesOutsideVocabulary(
        ['occasion:wake', 'venue:bar', 'venue:speakeasy', 'occasion:wake'],
        facets,
        vocabulary
      )
    ).toEqual(['occasion:wake', 'venue:speakeasy']);
  });

  it('refuses nothing it cannot judge: with no taxonomy loaded, no axis is closed', () => {
    expect(closedValuesOutsideVocabulary(['venue:speakeasy'], [], vocabulary)).toEqual([]);
  });
});

describe('withoutMarkerTags', () => {
  it('drops marker-axis values and keeps every other tag in order (POPS-3704)', () => {
    expect(
      withoutMarkerTags(
        ['venue:pub', 'flag:needs-review', 'trip:cairns-2026', 'Groceries', 'mood:cheerful'],
        facets
      )
    ).toEqual(['venue:pub', 'trip:cairns-2026', 'Groceries', 'mood:cheerful']);
  });

  it('drops a marker value whatever its casing and padding, as the server compares it', () => {
    expect(withoutMarkerTags([' FLAG:needs-review ', 'Flag:x', 'venue:pub'], facets)).toEqual([
      'venue:pub',
    ]);
  });
});
