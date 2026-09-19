import { describe, expect, it } from 'vitest';

import { rankCandidates } from '../ranker.js';

function multiset(values: readonly string[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  return tally;
}

describe('rankCandidates', () => {
  it('returns a permutation of the input for a same-stem batch', () => {
    const candidates = ['ABC010', 'ABC011', 'ABC012'];
    const ranked = rankCandidates({ name: 'Widget', candidates });

    expect(multiset(ranked)).toEqual(multiset(candidates));
    expect(ranked).toHaveLength(candidates.length);
  });

  it('prefers the lowest numeric suffix when every candidate shares the majority stem', () => {
    const candidates = ['ABC012', 'ABC010', 'ABC011'];
    expect(rankCandidates({ name: 'Widget', candidates })).toEqual(['ABC010', 'ABC011', 'ABC012']);
  });

  it('prefers a candidate matching typeKey over one matching only the majority stem', () => {
    // Two candidates share stem XYZ (majority); one lone candidate matches
    // typeKey 'ABC'. The typeKey match must still win despite being outnumbered.
    const candidates = ['XYZ005', 'XYZ004', 'ABC099'];
    const ranked = rankCandidates({ name: 'Widget', typeKey: 'ABC', candidates });

    expect(ranked[0]).toBe('ABC099');
  });

  it('is deterministic across repeated calls with the same input', () => {
    const input = { name: 'Widget', typeKey: 'ABC', candidates: ['ABC010', 'XYZ001', 'ABC009'] };
    const first = rankCandidates(input);
    const second = rankCandidates({ ...input, candidates: [...input.candidates] });

    expect(second).toEqual(first);
  });

  it('does not mutate the input array', () => {
    const candidates = ['ABC012', 'ABC010', 'ABC011'];
    const copy = [...candidates];
    rankCandidates({ name: 'Widget', candidates });

    expect(candidates).toEqual(copy);
  });

  it('handles a single candidate as a no-op', () => {
    expect(rankCandidates({ name: 'Widget', candidates: ['ABC001'] })).toEqual(['ABC001']);
  });

  it('handles candidates with no trailing digits without throwing', () => {
    const candidates = ['MISC', 'OTHER', 'ABC010'];
    const ranked = rankCandidates({ name: 'Widget', candidates });

    expect(multiset(ranked)).toEqual(multiset(candidates));
  });

  it('breaks a fully-tied score by ascending suffix, then by original order', () => {
    // No typeKey, and every stem is distinct, so the first candidate anchors
    // the "majority" stem (a tie broken toward the earliest occurrence) and
    // the other two score identically — resolved by suffix, then input order.
    const candidates = ['AAA005', 'BBB005', 'CCC001'];
    expect(rankCandidates({ name: 'Widget', candidates })).toEqual(['AAA005', 'CCC001', 'BBB005']);
  });
});
