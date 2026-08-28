/**
 * The shared `tags`-column reader (POPS-2642).
 *
 * `parseStoredTags` is the single decoder behind every reader of the column —
 * transactions, corrections, tag rules, rejections, entity venue evidence and
 * the suggester — so the payloads it has to survive are asserted here rather
 * than once per caller.
 */
import { describe, expect, it } from 'vitest';

import { parseStoredTags } from '../tag-facets.js';

describe('parseStoredTags', () => {
  it('parses a stored array', () => {
    expect(parseStoredTags('["venue:bar","contains:food"]')).toEqual([
      'venue:bar',
      'contains:food',
    ]);
  });

  it('reads an absent column as no tags', () => {
    expect(parseStoredTags(null)).toEqual([]);
    expect(parseStoredTags(undefined)).toEqual([]);
    expect(parseStoredTags('')).toEqual([]);
  });

  it('returns nothing for malformed JSON rather than throwing', () => {
    expect(parseStoredTags('["venue:bar"')).toEqual([]);
    expect(parseStoredTags('not json at all')).toEqual([]);
  });

  it('returns nothing for a well-formed non-array payload', () => {
    expect(parseStoredTags('"venue:bar"')).toEqual([]);
    expect(parseStoredTags('{"venue":"bar"}')).toEqual([]);
    expect(parseStoredTags('null')).toEqual([]);
  });

  it('drops non-string members instead of the whole row', () => {
    expect(parseStoredTags('["venue:bar",7,null,{"a":1},"trip:lisbon"]')).toEqual([
      'venue:bar',
      'trip:lisbon',
    ]);
  });

  it('preserves an empty stored array', () => {
    expect(parseStoredTags('[]')).toEqual([]);
  });
});
