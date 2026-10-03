import { describe, expect, it } from 'vitest';

import { fuseByReciprocalRank } from '../rank-fusion.js';

import type { RetrievalResult } from '../types.js';

function hit(id: string, matchType: RetrievalResult['matchType'], score: number): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId: id,
    title: id,
    contentPreview: `${matchType} preview`,
    score,
    matchType,
    metadata: {},
  };
}

describe('fuseByReciprocalRank', () => {
  it('puts a source both legs found above the top hit of either leg', () => {
    const semantic = [hit('sem-top', 'semantic', 0.9), hit('shared', 'semantic', 0.4)];
    const lexical = [hit('lex-top', 'lexical', 1), hit('shared', 'lexical', 0.3)];

    const fused = fuseByReciprocalRank(semantic, lexical, 10);

    expect(fused.map((r) => r.sourceId)).toEqual(['shared', 'sem-top', 'lex-top']);
  });

  it('marks a shared source `both` and keeps its cosine, not its lexical score or the RRF value', () => {
    const fused = fuseByReciprocalRank(
      [hit('shared', 'semantic', 0.42)],
      [hit('shared', 'lexical', 1)],
      10
    );

    expect(fused).toHaveLength(1);
    expect(fused[0]?.matchType).toBe('both');
    expect(fused[0]?.score).toBe(0.42);
    expect(fused[0]?.contentPreview).toBe('semantic preview');
  });

  it('leaves single-leg hits with their own match type and score', () => {
    const fused = fuseByReciprocalRank(
      [hit('sem', 'semantic', 0.5)],
      [hit('lex', 'lexical', 1)],
      10
    );

    expect(fused.map((r) => [r.sourceId, r.matchType, r.score])).toEqual([
      ['sem', 'semantic', 0.5],
      ['lex', 'lexical', 1],
    ]);
  });

  it('returns the lexical hits in order when the semantic leg is empty', () => {
    const lexical = [hit('a', 'lexical', 1), hit('b', 'lexical', 0.6)];

    expect(fuseByReciprocalRank([], lexical, 10)).toEqual(lexical);
  });

  it('does not merge sources that share an id across source types', () => {
    const transaction = { ...hit('42', 'semantic', 0.5), sourceType: 'transaction' };

    const fused = fuseByReciprocalRank([transaction], [hit('42', 'lexical', 1)], 10);

    expect(fused.map((r) => r.matchType)).toEqual(['semantic', 'lexical']);
  });

  it('cuts the fused list to the limit', () => {
    const lexical = [hit('a', 'lexical', 1), hit('b', 'lexical', 0.6), hit('c', 'lexical', 0.2)];

    expect(fuseByReciprocalRank([], lexical, 2).map((r) => r.sourceId)).toEqual(['a', 'b']);
  });
});
