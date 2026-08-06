import { describe, expect, it } from 'vitest';

import { descriptorMatches, hasWildcard } from '../descriptor.js';

describe('descriptorMatches', () => {
  it('matches a prefix wildcard, which is what the source fixtures store', () => {
    // `AMAZON%` is the shape already in `purchase_sources` fixtures. Under
    // substring matching it would look for a literal '%' and block every
    // candidate the source has.
    expect(descriptorMatches('AMAZON MKTPLACE AU', 'AMAZON%')).toBe(true);
    expect(descriptorMatches('BUNNINGS WAREHOUSE 123', 'BUNNINGS%')).toBe(true);
  });

  it('is case-insensitive in both directions', () => {
    expect(descriptorMatches('amazon mktplace au', 'AMAZON%')).toBe(true);
    expect(descriptorMatches('AMAZON MKTPLACE AU', 'amazon%')).toBe(true);
  });

  it('anchors, so a pattern without a wildcard is an equality test', () => {
    // The trap the Amazon CLI fell into: a bare `AMAZON` does NOT match
    // `AMAZON MKTPLACE AU`, so a source registered that way blocks its own
    // entire backlog.
    expect(descriptorMatches('AMAZON MKTPLACE AU', 'AMAZON')).toBe(false);
    expect(descriptorMatches('AMAZON', 'AMAZON')).toBe(true);
  });

  it('supports an infix wildcard', () => {
    expect(descriptorMatches('SQ *COFFEE SHOP', '%COFFEE%')).toBe(true);
    expect(descriptorMatches('TEA HOUSE', '%COFFEE%')).toBe(false);
  });

  it('supports the single-character wildcard', () => {
    expect(descriptorMatches('CARD 1234', 'CARD ____')).toBe(true);
    expect(descriptorMatches('CARD 123', 'CARD ____')).toBe(false);
  });

  it('treats regex syntax in a descriptor literally', () => {
    // `PAYPAL *MERCHANT` is a real bank descriptor. If the pattern were
    // compiled without escaping, the `*` would be read as a quantifier and
    // the match would be nonsense.
    expect(descriptorMatches('PAYPAL *MERCHANT', 'PAYPAL *%')).toBe(true);
    expect(descriptorMatches('PAYPALXMERCHANT', 'PAYPAL *%')).toBe(false);
    expect(descriptorMatches('A.B', 'A.B')).toBe(true);
    expect(descriptorMatches('AXB', 'A.B')).toBe(false);
  });

  it('blocks nothing when the source declares no pattern', () => {
    // Absent is different from "declared one that matches nothing".
    expect(descriptorMatches('ANYTHING AT ALL', null)).toBe(true);
    expect(descriptorMatches('ANYTHING AT ALL', '')).toBe(true);
    expect(descriptorMatches('ANYTHING AT ALL', '   ')).toBe(true);
  });

  it('matches everything for a bare wildcard', () => {
    expect(descriptorMatches('WHATEVER', '%')).toBe(true);
  });
});

describe('hasWildcard', () => {
  it('distinguishes a pattern from an equality test', () => {
    expect(hasWildcard('AMAZON%')).toBe(true);
    expect(hasWildcard('CARD _')).toBe(true);
    expect(hasWildcard('AMAZON')).toBe(false);
  });
});
