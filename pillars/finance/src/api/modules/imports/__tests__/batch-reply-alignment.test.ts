/**
 * A batched reply is placed by the line number each object echoes, never by
 * its position in the array (POPS-3670).
 *
 * Positional alignment had nothing to check against: a model that dropped one
 * object from the middle of a batch gave every later row its neighbour's tags,
 * with no error and no log. These cases are the ways a reply goes wrong — a
 * dropped middle object, a reordered array, a duplicate, an out-of-range or
 * missing number — and each must either land every surviving object on its own
 * row or refuse the reply outright. None may shift a row.
 */
import { describe, expect, it } from 'vitest';

import { parseJsonArrayReply } from '../ai-categorizer-batch-api.js';
import { AiCategorizationError } from '../ai-categorizer-error.js';
import { parseTagsOnlyEntries } from '../ai-tags-only-api.js';

const VOCAB = ['venue:pub', 'venue:cafe', 'venue:supermarket'];

function venueOf(entry: { tags: string[] } | null): string | null {
  return entry?.tags.find((tag) => tag.startsWith('venue:')) ?? null;
}

describe('parseJsonArrayReply — alignment by echoed line number', () => {
  it('keeps every row after a dropped middle object on its own line', () => {
    const entries = parseTagsOnlyEntries(
      '[{"n": 1, "venue": "pub"}, {"n": 3, "venue": "supermarket"}]',
      3,
      VOCAB
    );

    expect(entries.map(venueOf)).toEqual(['venue:pub', null, 'venue:supermarket']);
  });

  it('places a reversed reply by number, not by position', () => {
    const entries = parseTagsOnlyEntries(
      '[{"n": 3, "venue": "supermarket"}, {"n": 2, "venue": "cafe"}, {"n": 1, "venue": "pub"}]',
      3,
      VOCAB
    );

    expect(entries.map(venueOf)).toEqual(['venue:pub', 'venue:cafe', 'venue:supermarket']);
  });

  it('keeps the covered rows of a truncated reply, since its numbers are still trustworthy', () => {
    const slots = parseJsonArrayReply('[{"n": 1}, {"n": 2}]', 5);

    expect(slots.map((slot) => slot?.['n'] ?? null)).toEqual([1, 2, null, null, null]);
  });

  it.each([
    ['two objects claim the same line', '[{"n": 1}, {"n": 1}]'],
    ['a line number is out of range', '[{"n": 1}, {"n": 4}]'],
    ['a line number is zero', '[{"n": 0}]'],
    ['an object carries no line number', '[{"n": 1}, {"venue": "pub"}]'],
    ['a line number is not an integer', '[{"n": 1.5}]'],
    ['a line number is a string', '[{"n": "2"}]'],
  ])('refuses the whole reply when %s', (_case, reply) => {
    expect(() => parseJsonArrayReply(reply, 3)).toThrow(AiCategorizationError);
    expect(() => parseJsonArrayReply(reply, 3)).toThrow(/cannot be aligned/);
  });

  it('refuses with PARSE_ERROR, the code every caller already degrades a batch on', () => {
    try {
      parseJsonArrayReply('[{"n": 2}, {"n": 2}]', 3);
      expect.unreachable('an unaligned reply must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AiCategorizationError);
      expect((error as AiCategorizationError).code).toBe('PARSE_ERROR');
    }
  });

  it('skips a non-object element without letting it displace a numbered one', () => {
    const slots = parseJsonArrayReply('["noise", {"n": 2}, 7, null]', 2);

    expect(slots.map((slot) => slot?.['n'] ?? null)).toEqual([null, 2]);
  });
});
