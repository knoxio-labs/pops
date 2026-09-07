import type { SpendAccounting } from '@/fixtures/purchases-merchant-spend';

export interface ExplainedSplit {
  totalCents: number;
  explainedCents: number;
  residualCents: number;
  /**
   * Share of the total that is explained, or `null` when no share of it is
   * meaningful. Never 100 while anything is unexplained.
   */
  explainedPercent: number | null;
  /** True whenever money is unaccounted for, in either direction. */
  hasResidual: boolean;
}

/**
 * The explained / unexplained split of one accounting roll-up.
 *
 * `residualCents` is taken verbatim from the input and `explainedCents` is
 * its complement, rather than the other way round — the residual is the
 * figure that must never drift, so it is the primary and never re-derived.
 */
export function explainedSplit(accounting: SpendAccounting): ExplainedSplit {
  const { totalCents, residualCents } = accounting;
  const explainedCents = totalCents - residualCents;

  return {
    totalCents,
    explainedCents,
    residualCents,
    explainedPercent: explainedPercentOf(totalCents, explainedCents, residualCents),
    hasResidual: residualCents !== 0,
  };
}

/**
 * A percentage is only offered when it can be read literally.
 *
 * Two cases would otherwise produce a confident falsehood. A residual of one
 * cent against a five-figure total rounds to `100%`, which reads as "nothing
 * is unexplained" while something is — so an unexplained bucket clamps the
 * share to 99 however small it is. And a negative total, or a residual so
 * negative that more has been linked than was ever spent, is not a
 * part-of-whole at all; `null` renders as no percentage rather than as a
 * number that survived a clamp with its meaning gone.
 */
function explainedPercentOf(
  totalCents: number,
  explainedCents: number,
  residualCents: number
): number | null {
  if (totalCents <= 0) return null;
  if (residualCents === 0) return 100;
  if (explainedCents >= totalCents) return null;
  if (explainedCents <= 0) return 0;

  const rounded = Math.round((explainedCents / totalCents) * 100);
  return Math.min(99, Math.max(1, rounded));
}
