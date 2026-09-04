import { aiMatchedTitle, isAutoMatchedType, ruleMatchedTitle } from '@/kit/import-txn-card';
import { describe, expect, it } from 'vitest';

describe('aiMatchedTitle', () => {
  it('reports no confidence when none was returned', () => {
    expect(aiMatchedTitle(undefined)).toBe('Entity resolved by AI (no reported confidence)');
  });

  it('calls out low confidence below the trust threshold', () => {
    expect(aiMatchedTitle(0.54)).toBe(
      'Entity resolved by AI — low confidence (54%), review before trusting'
    );
  });

  it('reports a plain confidence at or above the threshold', () => {
    expect(aiMatchedTitle(0.82)).toBe('Entity resolved by AI — confidence 82%');
    expect(aiMatchedTitle(0.7)).toBe('Entity resolved by AI — confidence 70%');
  });
});

describe('isAutoMatchedType', () => {
  it('is true for every deterministic match type', () => {
    expect(isAutoMatchedType('alias')).toBe(true);
    expect(isAutoMatchedType('exact')).toBe(true);
    expect(isAutoMatchedType('prefix')).toBe(true);
    expect(isAutoMatchedType('contains')).toBe(true);
  });

  it('is false for an AI guess or a learned rule, and for no match at all', () => {
    expect(isAutoMatchedType('ai')).toBe(false);
    expect(isAutoMatchedType('learned')).toBe(false);
    expect(isAutoMatchedType('manual')).toBe(false);
    expect(isAutoMatchedType(undefined)).toBe(false);
  });
});

describe('ruleMatchedTitle', () => {
  it('falls back to a bare label when there is no provenance', () => {
    expect(ruleMatchedTitle(undefined)).toBe('Rule matched');
  });

  it('lists the pattern, match type and confidence when provenance is present', () => {
    const title = ruleMatchedTitle({
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.98,
    });
    expect(title).toContain('Pattern: WOOLWORTHS');
    expect(title).toContain('Match type: contains');
    expect(title).toContain('Confidence: 98%');
  });
});
