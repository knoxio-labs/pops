/** Where a rate change came from — `manual` for one typed in, `imported` for one read off a statement. */
export type LoanRateSource = 'manual' | 'imported';

/** One rate a loan account has carried — mirrors the wire shape of `loan_rate_history`. */
export interface LoanRateEntry {
  id: string;
  annualRatePct: number;
  effectiveFrom: string;
  source: LoanRateSource;
}

/**
 * `a11` (Home loan)'s rate history, newest first — matching `listRateHistory`'s
 * ordering (POPS-2829). Two `imported` rows model a statement-carried change;
 * the most recent `manual` row is what someone would have typed after a call
 * with the lender.
 */
export const loanRateHistoryByAccountId: Record<string, LoanRateEntry[]> = {
  a11: [
    { id: 'lr3', annualRatePct: 6.24, effectiveFrom: '2026-07-01', source: 'manual' },
    { id: 'lr2', annualRatePct: 6.09, effectiveFrom: '2026-02-01', source: 'imported' },
    { id: 'lr1', annualRatePct: 5.89, effectiveFrom: '2025-10-14', source: 'imported' },
  ],
};
