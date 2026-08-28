/**
 * Closed-set validation of the categorizer's tag output (POPS-2606).
 *
 * These are the tests that make "the model may only classify" true rather than
 * merely requested: the prompt asks, and this rejects. Each case is a way the
 * model can hand back something the vocabulary does not contain — a coined
 * value, a namespace that is not its to write, a second value on an axis that
 * holds one.
 */
import { describe, expect, it, vi } from 'vitest';

import { logRejectedTagValues, validateAiTags } from '../ai-tag-validation.js';

const VOCAB = [
  'venue:bar',
  'venue:restaurant',
  'occasion:out',
  'occasion:travel',
  'contains:food',
  'contains:alcohol',
  'channel:online',
  'fee:surcharge',
  // present in the vocabulary, but not the model's to write:
  'enrich:amazon',
  'person:rosane',
  'flag:needs-review',
  'trip:hunter-valley-2026',
];

describe('validateAiTags — a value outside the closed set', () => {
  it('drops the unknown value, keeps every valid facet, and reports the rejection', () => {
    const result = validateAiTags({ venue: 'casino', occasion: 'out', contains: ['food'] }, VOCAB);

    expect(result.tags).toEqual(['occasion:out', 'contains:food']);
    expect(result.rejected).toEqual([
      { facet: 'venue', value: 'casino', reason: 'value-not-in-closed-set' },
    ]);
  });

  it('drops it when it arrives fully qualified as `venue:casino` too', () => {
    const result = validateAiTags({ tags: ['venue:casino', 'contains:food'] }, VOCAB);

    expect(result.tags).toEqual(['contains:food']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('value-not-in-closed-set');
  });

  it('does not let a value from one facet satisfy another', () => {
    const result = validateAiTags({ venue: 'contains:food' }, VOCAB);

    expect(result.tags).toEqual([]);
    expect(result.rejected[0]).toEqual({
      facet: 'venue',
      value: 'contains:food',
      reason: 'value-not-in-closed-set',
    });
  });

  it('accepts a value the model qualified with its own facet', () => {
    expect(validateAiTags({ venue: 'venue:bar' }, VOCAB).tags).toEqual(['venue:bar']);
  });

  it('accepts a value whose casing differs from the stored one', () => {
    expect(validateAiTags({ venue: 'Bar', contains: ['ALCOHOL'] }, VOCAB).tags).toEqual([
      'venue:bar',
      'contains:alcohol',
    ]);
  });

  it('drops everything when the vocabulary is empty rather than trusting the model', () => {
    const result = validateAiTags({ venue: 'bar', contains: ['food'] }, []);

    expect(result.tags).toEqual([]);
    expect(result.rejected).toHaveLength(2);
  });
});

describe('validateAiTags — namespaces that are not the model’s to write', () => {
  it.each(['enrich:amazon', 'person:rosane', 'flag:needs-review'])(
    'rejects the marker value %s even though it exists in the vocabulary',
    (tag) => {
      const result = validateAiTags({ tags: [tag] }, VOCAB);

      expect(result.tags).toEqual([]);
      expect(result.rejected[0]?.reason).toBe('facet-not-closed');
    }
  );

  it('rejects an open-namespace value that exists in the vocabulary', () => {
    const result = validateAiTags({ tags: ['trip:hunter-valley-2026'] }, VOCAB);

    expect(result.tags).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('facet-not-closed');
  });

  it('ignores a marker field the model invents alongside the real ones', () => {
    const result = validateAiTags({ enrich: 'amazon', contains: ['food'] }, VOCAB);

    expect(result.tags).toEqual(['contains:food']);
    expect(result.rejected).toEqual([]);
  });

  it('rejects an unprefixed flat tag — the pre-migration shape', () => {
    const result = validateAiTags({ tags: ['Groceries'] }, VOCAB);

    expect(result.tags).toEqual([]);
    expect(result.rejected[0]).toEqual({
      facet: null,
      value: 'Groceries',
      reason: 'facet-not-closed',
    });
  });
});

describe('validateAiTags — cardinality', () => {
  it('keeps the first occasion and rejects the second', () => {
    const result = validateAiTags({ occasion: ['out', 'travel'] }, VOCAB);

    expect(result.tags).toEqual(['occasion:out']);
    expect(result.rejected).toEqual([
      { facet: 'occasion', value: 'travel', reason: 'exceeds-facet-cardinality' },
    ]);
  });

  it('applies the same rule to a second occasion arriving in the flat tags array', () => {
    const result = validateAiTags({ occasion: 'out', tags: ['occasion:travel'] }, VOCAB);

    expect(result.tags).toEqual(['occasion:out']);
    expect(result.rejected[0]?.reason).toBe('exceeds-facet-cardinality');
  });

  it('keeps a single venue and rejects a second', () => {
    const result = validateAiTags({ venue: ['bar', 'restaurant'] }, VOCAB);

    expect(result.tags).toEqual(['venue:bar']);
    expect(result.rejected[0]?.reason).toBe('exceeds-facet-cardinality');
  });

  it('does not spend the single slot on a rejected value', () => {
    const result = validateAiTags({ venue: ['casino', 'bar'] }, VOCAB);

    expect(result.tags).toEqual(['venue:bar']);
    expect(result.rejected[0]?.reason).toBe('value-not-in-closed-set');
  });

  it('keeps every value on a multi-valued facet', () => {
    expect(validateAiTags({ contains: ['food', 'alcohol'] }, VOCAB).tags).toEqual([
      'contains:food',
      'contains:alcohol',
    ]);
  });

  it('does not count a repeated value as a cardinality breach', () => {
    const result = validateAiTags({ venue: ['bar', 'bar'] }, VOCAB);

    expect(result.tags).toEqual(['venue:bar']);
    expect(result.rejected).toEqual([]);
  });
});

describe('validateAiTags — malformed output', () => {
  it.each([
    ['a number', 42],
    ['null', null],
    ['an object', { value: 'bar' }],
    ['an empty string', ''],
  ])('ignores %s in a facet field', (_label, value) => {
    expect(validateAiTags({ venue: value, contains: ['food'] }, VOCAB).tags).toEqual([
      'contains:food',
    ]);
  });

  it('keeps the string entries of a mixed array', () => {
    expect(validateAiTags({ contains: ['food', 7, null, 'alcohol'] }, VOCAB).tags).toEqual([
      'contains:food',
      'contains:alcohol',
    ]);
  });

  it('returns nothing at all for a reply with no tag fields', () => {
    expect(validateAiTags({ entityName: 'Woolworths' }, VOCAB)).toEqual({
      tags: [],
      rejected: [],
    });
  });
});

describe('logRejectedTagValues', () => {
  it('logs the refused value and why, so a recurring miss is visible', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      logRejectedTagValues([
        { facet: 'venue', value: 'casino', reason: 'value-not-in-closed-set' },
        { facet: 'enrich', value: 'amazon', reason: 'facet-not-closed' },
      ]);

      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0]?.[0]).toContain('venue:casino');
      expect(warn.mock.calls[0]?.[0]).toContain('value-not-in-closed-set');
      expect(warn.mock.calls[1]?.[0]).toContain('enrich is marker');
    } finally {
      warn.mockRestore();
    }
  });
});
