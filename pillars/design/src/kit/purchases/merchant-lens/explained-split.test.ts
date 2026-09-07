import { describe, expect, it } from 'vitest';

import { explainedSplit } from './explained-split';

import type { SpendAccounting } from '@/fixtures/purchases-merchant-spend';

function accounting(
  totalCents: number,
  residualCents: number,
  parts: Partial<SpendAccounting> = {}
): SpendAccounting {
  return {
    totalCents,
    matchedCents: totalCents - residualCents,
    awaitingImportCents: 0,
    refundedCents: 0,
    residualCents,
    netSpendCents: totalCents,
    ...parts,
  };
}

describe('explainedSplit', () => {
  it('is fully explained at zero residual, and reports 100%', () => {
    const split = explainedSplit(accounting(10_000, 0));
    expect(split).toEqual({
      totalCents: 10_000,
      explainedCents: 10_000,
      residualCents: 0,
      explainedPercent: 100,
      hasResidual: false,
    });
  });

  it('clamps a one-cent residual to 99%, never 100, so it is never read as fully explained', () => {
    const split = explainedSplit(accounting(10_000, 1));
    expect(split.explainedPercent).toBe(99);
    expect(split.hasResidual).toBe(true);
  });

  it('clamps a residual of nearly everything to 1%, never 0, while any of it is explained', () => {
    const split = explainedSplit(accounting(10_000, 9_950));
    expect(split.explainedPercent).toBe(1);
  });

  it('reports 0% when nothing at all is explained', () => {
    const split = explainedSplit(accounting(10_000, 10_000));
    expect(split.explainedPercent).toBe(0);
  });

  it('offers no percentage for a non-positive total', () => {
    expect(explainedSplit(accounting(0, 0)).explainedPercent).toBeNull();
    expect(explainedSplit(accounting(-500, -500)).explainedPercent).toBeNull();
  });

  it('offers no percentage when more has been linked than the total, an over-linked order', () => {
    const split = explainedSplit(accounting(10_000, -200));
    expect(split.explainedPercent).toBeNull();
    expect(split.hasResidual).toBe(true);
    expect(split.residualCents).toBe(-200);
  });
  it('takes the residual as given rather than re-deriving it from the matched figures', () => {
    // matched + awaiting disagrees with total - residual. The residual is the
    // figure that must survive; explained is the one allowed to absorb the
    // disagreement. Deriving it the other way round is the dropped-residual
    // error one layer down, one dimension over.
    const split = explainedSplit(
      accounting(10_000, 2_500, { matchedCents: 1, awaitingImportCents: 1 })
    );

    expect(split.residualCents).toBe(2_500);
    expect(split.explainedCents).toBe(7_500);
  });
});
