/**
 * Whose location wins when a correction rule matches a row that already has one.
 *
 * Transaction `2adf197e` read `PRICELINE PHARMACY BOWR BOWRAL` and was stamped
 * `Canterbury`. Every other Priceline row in the ledger is
 * `PRICELINE PHARMACY CANT CANTERBURY`, so the rule learned from the many
 * carried `Canterbury` and overwrote the one that said otherwise — a location
 * contradicting its own descriptor, 120km away, reading as home when it should
 * plausibly read as travel (POPS-3289).
 *
 * A rule is matched on the DESCRIPTION, and a descriptor names its own suburb.
 * So the assertions here are about the row keeping what it said.
 */
import { describe, expect, it } from 'vitest';

import { resolveCorrectionLocation } from '../correction-location.js';

describe('resolveCorrectionLocation', () => {
  it('keeps the location the row states, over the one the rule learned', () => {
    expect(resolveCorrectionLocation('Bowral', 'Canterbury')).toBe('Bowral');
  });

  it('fills a location the row does not state, which is most rows', () => {
    // Most parsers state none, and this is what the rule's location is for.
    expect(resolveCorrectionLocation(undefined, 'Canterbury')).toBe('Canterbury');
    expect(resolveCorrectionLocation(null, 'Canterbury')).toBe('Canterbury');
  });

  it('two rows on one entity with different suburbs each keep their own', () => {
    // The ticket's own acceptance criterion, stated as the pair that produced
    // it: one pattern, one rule, two suburbs.
    const rule = 'Canterbury';

    expect(resolveCorrectionLocation('Bowral', rule)).toBe('Bowral');
    expect(resolveCorrectionLocation('Canterbury', rule)).toBe('Canterbury');
  });

  it('treats a blank as no location at all, so it does not beat a rule that knows', () => {
    // A parser that wrote an empty string said nothing about where the row was.
    expect(resolveCorrectionLocation('', 'Canterbury')).toBe('Canterbury');
    expect(resolveCorrectionLocation('   ', 'Canterbury')).toBe('Canterbury');
  });

  it('answers nothing when neither states one, rather than an empty string', () => {
    expect(resolveCorrectionLocation(undefined, undefined)).toBeUndefined();
    expect(resolveCorrectionLocation(null, null)).toBeUndefined();
    expect(resolveCorrectionLocation('', '  ')).toBeUndefined();
  });

  it("keeps the row's own value verbatim, spacing included", () => {
    // Not trimmed on the way through: what is stored is what the parser wrote,
    // and normalising it here would make this function a second, silent writer.
    expect(resolveCorrectionLocation(' Bowral ', 'Canterbury')).toBe(' Bowral ');
  });
});
