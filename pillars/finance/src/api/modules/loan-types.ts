/**
 * Wire mappers for the loan domain (POPS-2829). The zod schemas live in the
 * REST contract (`src/contract/rest-loan.ts`); this file keeps only the
 * row → response projections, the body → service-input projection, and their
 * TS shapes.
 *
 * Money crosses from the pillar's internal integer cents to the decimal-dollar
 * wire contract exactly here (#3665, CF041).
 */
import { centsToDollars, dollarsToCents } from '../../money.js';

import type { LoanRateSource, LoanTermsSource } from '../../contract/loan.js';
import type {
  LoanOffsetLinkRow,
  LoanRateHistoryRow,
  LoanTermsRow,
  WriteLoanTermsInput,
} from '../../db/index.js';

/** API response shape for a loan's terms — money in decimal dollars. */
export interface LoanTerms {
  accountId: string;
  originalPrincipal: number;
  annualRatePct: number;
  termMonths: number;
  monthlyRepayment: number;
  startedOn: string;
  termsEffectiveFrom: string;
  source: LoanTermsSource;
  createdAt: string;
  updatedAt: string;
}

/** Wire body accepted by `PUT /accounts/:id/loan-terms` (dollars). */
export interface WriteLoanTermsBody {
  originalPrincipal: number;
  annualRatePct: number;
  termMonths: number;
  monthlyRepayment: number;
  startedOn: string;
  termsEffectiveFrom: string;
}

/** API response shape for one rate-history row. */
export interface LoanRate {
  id: string;
  loanAccountId: string;
  annualRatePct: number;
  effectiveFrom: string;
  source: LoanRateSource;
  createdAt: string;
}

/** API response shape for one offset link. */
export interface LoanOffsetLink {
  id: string;
  loanAccountId: string;
  offsetAccountId: string;
  linkedFrom: string;
  unlinkedAt: string | null;
  createdAt: string;
}

/** Map a `loan_terms` row to the API response shape. */
export function toLoanTerms(row: LoanTermsRow): LoanTerms {
  return {
    accountId: row.accountId,
    originalPrincipal: centsToDollars(row.originalPrincipalCents),
    annualRatePct: row.annualRatePct,
    termMonths: row.termMonths,
    monthlyRepayment: centsToDollars(row.monthlyRepaymentCents),
    startedOn: row.startedOn,
    termsEffectiveFrom: row.termsEffectiveFrom,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Map a request body's dollar amounts back to the service layer's cents. */
export function toWriteLoanTermsInput(body: WriteLoanTermsBody): WriteLoanTermsInput {
  return {
    originalPrincipalCents: dollarsToCents(body.originalPrincipal),
    annualRatePct: body.annualRatePct,
    termMonths: body.termMonths,
    monthlyRepaymentCents: dollarsToCents(body.monthlyRepayment),
    startedOn: body.startedOn,
    termsEffectiveFrom: body.termsEffectiveFrom,
  };
}

/** Map a `loan_rate_history` row to the API response shape. */
export function toLoanRate(row: LoanRateHistoryRow): LoanRate {
  return {
    id: row.id,
    loanAccountId: row.loanAccountId,
    annualRatePct: row.annualRatePct,
    effectiveFrom: row.effectiveFrom,
    source: row.source,
    createdAt: row.createdAt,
  };
}

/** Map a `loan_offset_links` row to the API response shape. */
export function toLoanOffsetLink(row: LoanOffsetLinkRow): LoanOffsetLink {
  return {
    id: row.id,
    loanAccountId: row.loanAccountId,
    offsetAccountId: row.offsetAccountId,
    linkedFrom: row.linkedFrom,
    unlinkedAt: row.unlinkedAt,
    createdAt: row.createdAt,
  };
}
