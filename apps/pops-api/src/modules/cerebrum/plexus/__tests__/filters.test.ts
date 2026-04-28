import { describe, expect, it } from 'vitest';

import {
  applyFilters,
  compileFilter,
  compileFilters,
  dryRun,
  evaluateItem,
  extractField,
} from '../filters.js';

import type { EngineData, FilterRule } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(overrides: Partial<EngineData> = {}): EngineData {
  return {
    body: 'test body',
    source: 'plexus:test',
    ...overrides,
  };
}

function rule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    filterType: 'include',
    field: 'body',
    pattern: '.*',
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// compileFilter
// ---------------------------------------------------------------------------

describe('compileFilter', () => {
  it('compiles a valid regex pattern', () => {
    const result = compileFilter(rule({ pattern: '^hello' }));
    expect(result).not.toBeNull();
    expect(result?.regex.source).toBe('^hello');
  });

  it('returns null for an invalid regex pattern', () => {
    const result = compileFilter(rule({ pattern: '[invalid' }));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compileFilters
// ---------------------------------------------------------------------------

describe('compileFilters', () => {
  it('separates valid and invalid filters', () => {
    const rules: FilterRule[] = [
      rule({ pattern: '^valid' }),
      rule({ pattern: '[bad' }),
      rule({ pattern: 'also-valid$' }),
    ];
    const { compiled, invalid } = compileFilters(rules);
    expect(compiled).toHaveLength(2);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.pattern).toBe('[bad');
  });

  it('skips disabled filters', () => {
    const { compiled } = compileFilters([rule({ enabled: false })]);
    expect(compiled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractField
// ---------------------------------------------------------------------------

describe('extractField', () => {
  it('extracts well-known fields', () => {
    const e = item({ title: 'Title', type: 'note', source: 'plexus:x', externalId: 'ext-1' });
    expect(extractField(e, 'body')).toBe('test body');
    expect(extractField(e, 'title')).toBe('Title');
    expect(extractField(e, 'type')).toBe('note');
    expect(extractField(e, 'source')).toBe('plexus:x');
    expect(extractField(e, 'externalId')).toBe('ext-1');
  });

  it('joins tags and scopes as comma-separated strings', () => {
    const e = item({ tags: ['a', 'b'], scopes: ['s1', 's2'] });
    expect(extractField(e, 'tags')).toBe('a,b');
    expect(extractField(e, 'scopes')).toBe('s1,s2');
  });

  it('extracts from customFields', () => {
    const e = item({ customFields: { subject: 'Re: hello', priority: 3 } });
    expect(extractField(e, 'subject')).toBe('Re: hello');
    expect(extractField(e, 'priority')).toBe('3');
  });

  it('returns undefined for missing fields', () => {
    expect(extractField(item(), 'nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateItem
// ---------------------------------------------------------------------------

describe('evaluateItem', () => {
  it('accepts all items when no filters are compiled', () => {
    expect(evaluateItem(item(), [])).toBe(true);
  });

  it('accepts items matching an include filter', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'include', field: 'body', pattern: 'test' }),
    ]);
    expect(evaluateItem(item(), compiled)).toBe(true);
  });

  it('rejects items not matching any include filter', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'include', field: 'body', pattern: '^no-match$' }),
    ]);
    expect(evaluateItem(item(), compiled)).toBe(false);
  });

  it('rejects items matching an exclude filter', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'exclude', field: 'body', pattern: 'test' }),
    ]);
    expect(evaluateItem(item(), compiled)).toBe(false);
  });

  it('accepts items not matching any exclude filter', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'exclude', field: 'body', pattern: '^no-match$' }),
    ]);
    expect(evaluateItem(item(), compiled)).toBe(true);
  });

  it('evaluates includes first, then excludes', () => {
    const { compiled } = compileFilters([
      // Include anything with "report" in body.
      rule({ filterType: 'include', field: 'body', pattern: 'report' }),
      // Exclude items with "draft" in title.
      rule({ filterType: 'exclude', field: 'title', pattern: 'draft' }),
    ]);

    // Matches include, does not match exclude → accepted.
    expect(evaluateItem(item({ body: 'quarterly report', title: 'Final' }), compiled)).toBe(true);

    // Matches include AND matches exclude → rejected.
    expect(evaluateItem(item({ body: 'quarterly report', title: 'draft v2' }), compiled)).toBe(
      false
    );

    // Does not match include → rejected (regardless of exclude).
    expect(evaluateItem(item({ body: 'meeting notes', title: 'Final' }), compiled)).toBe(false);
  });

  it('handles exclude-only rules (pass-through minus exclusions)', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'exclude', field: 'type', pattern: '^spam$' }),
    ]);

    expect(evaluateItem(item({ type: 'email' }), compiled)).toBe(true);
    expect(evaluateItem(item({ type: 'spam' }), compiled)).toBe(false);
  });

  it('handles include-only rules (only matching items pass)', () => {
    const { compiled } = compileFilters([
      rule({ filterType: 'include', field: 'type', pattern: '^email$' }),
    ]);

    expect(evaluateItem(item({ type: 'email' }), compiled)).toBe(true);
    expect(evaluateItem(item({ type: 'notification' }), compiled)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFilters (batch)
// ---------------------------------------------------------------------------

describe('applyFilters', () => {
  it('returns all items when no rules exist', () => {
    const items = [item({ body: 'a' }), item({ body: 'b' })];
    const result = applyFilters(items, []);
    expect(result.accepted).toHaveLength(2);
    expect(result.filtered).toBe(0);
  });

  it('filters items according to rules', () => {
    const items = [
      item({ body: 'keep this' }),
      item({ body: 'drop this' }),
      item({ body: 'keep that too' }),
    ];
    const rules: FilterRule[] = [rule({ filterType: 'include', field: 'body', pattern: 'keep' })];
    const result = applyFilters(items, rules);
    expect(result.accepted).toHaveLength(2);
    expect(result.filtered).toBe(1);
  });

  it('handles custom field filters', () => {
    const items = [
      item({ customFields: { from: 'alice@company.com' } }),
      item({ customFields: { from: 'spam@junk.com' } }),
    ];
    const rules: FilterRule[] = [
      rule({ filterType: 'include', field: 'from', pattern: '.*@company\\.com$' }),
    ];
    const result = applyFilters(items, rules);
    expect(result.accepted).toHaveLength(1);
    expect(result.filtered).toBe(1);
  });

  it('skips invalid patterns gracefully', () => {
    const items = [item({ body: 'a' })];
    const rules: FilterRule[] = [
      rule({ filterType: 'exclude', field: 'body', pattern: '[invalid' }),
    ];
    // Invalid pattern is skipped, so no filtering happens.
    const result = applyFilters(items, rules);
    expect(result.accepted).toHaveLength(1);
    expect(result.filtered).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe('dryRun', () => {
  it('partitions items into would-ingest and would-filter', () => {
    const items = [item({ body: 'keep' }), item({ body: 'drop' })];
    const rules: FilterRule[] = [rule({ filterType: 'include', field: 'body', pattern: 'keep' })];
    const result = dryRun(items, rules);
    expect(result.wouldIngest).toHaveLength(1);
    expect(result.wouldFilter).toHaveLength(1);
    expect(result.wouldIngest[0]?.body).toBe('keep');
    expect(result.wouldFilter[0]?.body).toBe('drop');
  });

  it('returns all items as would-ingest when no rules', () => {
    const items = [item(), item()];
    const result = dryRun(items, []);
    expect(result.wouldIngest).toHaveLength(2);
    expect(result.wouldFilter).toHaveLength(0);
  });
});
