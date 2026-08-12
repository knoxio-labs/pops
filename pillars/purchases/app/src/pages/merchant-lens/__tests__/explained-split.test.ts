import { describe, expect, it } from 'vitest';

import { explainedSplit } from '../explained-split';

import type { SpendAccounting } from '../types';

function accounting(overrides: Partial<SpendAccounting> = {}): SpendAccounting {
  return {
    totalCents: 1_041_200,
    matchedCents: 890_000,
    awaitingImportCents: 0,
    residualCents: 151_200,
    refundedCents: 0,
    netSpendCents: 1_041_200,
    ...overrides,
  };
}

describe('explainedSplit', () => {
  it('splits the ticket example the way the ticket states it', () => {
    const split = explainedSplit(accounting());

    expect(split.explainedCents).toBe(890_000);
    expect(split.residualCents).toBe(151_200);
    expect(split.explainedPercent).toBe(85);
    expect(split.hasResidual).toBe(true);
  });

  it('takes the residual from the server rather than re-deriving it', () => {
    // matched + awaitingImport disagrees with total - residual. The residual
    // is the figure that must survive; explained is the one allowed to absorb
    // the disagreement.
    const split = explainedSplit(
      accounting({
        totalCents: 10_000,
        matchedCents: 1,
        awaitingImportCents: 1,
        residualCents: 2500,
      })
    );

    expect(split.residualCents).toBe(2500);
    expect(split.explainedCents).toBe(7500);
  });

  it('reports 100% only when nothing at all is unexplained', () => {
    const split = explainedSplit(
      accounting({ totalCents: 5000, matchedCents: 5000, residualCents: 0, netSpendCents: 5000 })
    );

    expect(split.explainedPercent).toBe(100);
    expect(split.hasResidual).toBe(false);
    expect(split.residualCents).toBe(0);
  });

  // The failure this whole view exists to prevent, in miniature: a residual
  // small enough to round away turns a known unknown into a certainty.
  it('never rounds a one-cent residual up to fully explained', () => {
    const split = explainedSplit(
      accounting({ totalCents: 1_000_000, matchedCents: 999_999, residualCents: 1 })
    );

    expect(split.explainedPercent).toBe(99);
    expect(split.hasResidual).toBe(true);
  });

  it('never rounds a residual that is almost everything down to nothing explained', () => {
    const split = explainedSplit(
      accounting({ totalCents: 1_000_000, matchedCents: 1, residualCents: 999_999 })
    );

    expect(split.explainedPercent).toBe(1);
  });

  it('reports 0% when nothing is explained at all', () => {
    const split = explainedSplit(
      accounting({ totalCents: 5000, matchedCents: 0, awaitingImportCents: 0, residualCents: 5000 })
    );

    expect(split.explainedPercent).toBe(0);
    expect(split.hasResidual).toBe(true);
  });

  it('offers no percentage for an over-linked merchant, and still reports the residual', () => {
    const split = explainedSplit(
      accounting({ totalCents: 5000, matchedCents: 6000, residualCents: -1000 })
    );

    expect(split.explainedPercent).toBeNull();
    expect(split.explainedCents).toBe(6000);
    expect(split.residualCents).toBe(-1000);
    expect(split.hasResidual).toBe(true);
  });

  it('offers no percentage when the total is not a whole to take a share of', () => {
    expect(explainedSplit(accounting({ totalCents: 0, residualCents: 0 })).explainedPercent).toBe(
      null
    );
    expect(
      explainedSplit(accounting({ totalCents: -2500, residualCents: -2500 })).explainedPercent
    ).toBeNull();
  });
});
