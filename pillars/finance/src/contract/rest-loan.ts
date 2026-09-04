/**
 * `accounts/:id/loan-*` sub-router — terms, rate history and offset links for
 * `loan`-kind accounts (POPS-2829). Modelled on the gift-card-details
 * sub-router: extension tables hanging off one account, gated to one kind.
 *
 * Every route here 422s if the targeted account exists but is not
 * `kind: 'loan'` (`AccountKindMismatchError`), and `recordRate` 422s a rate
 * that would not be the loan's latest by `effectiveFrom` — see
 * `LoanRateNotLatestError` for why backdated corrections are refused.
 *
 * Money crosses the wire in decimal dollars (`originalPrincipal`,
 * `monthlyRepayment`), converted to the pillar's integer cents in
 * `api/modules/loan-types.ts` (#3665, CF041). `annualRatePct` is a
 * percentage on both sides — `5.49` means 5.49% p.a., never a fraction.
 *
 * `unlink` is a POST rather than a DELETE because it closes a link
 * (`unlinkedAt`) without removing it: the history of a past offset
 * arrangement is the point of the table.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { LOAN_RATE_SOURCES, LOAN_TERMS_SOURCES } from './loan.js';
import { ERR_RESPONSES_WITH_422 } from './rest-schemas.js';

const c = initContract();

/** ISO calendar date, `YYYY-MM-DD`. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO YYYY-MM-DD date');

/** Wire shape of a `loan_terms` row. Money in decimal dollars. */
export const LoanTermsSchema = z.object({
  accountId: z.string(),
  originalPrincipal: z.number(),
  annualRatePct: z.number(),
  termMonths: z.number().int(),
  monthlyRepayment: z.number(),
  startedOn: z.string(),
  termsEffectiveFrom: z.string(),
  source: z.enum(LOAN_TERMS_SOURCES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `source` is absent on purpose: `manual` is the only value a client could
 * send, so the server sets it rather than accepting it.
 */
const WriteLoanTermsBody = z.object({
  originalPrincipal: z.number().positive('Original principal must be positive'),
  annualRatePct: z.number().min(0, 'Annual rate cannot be negative'),
  termMonths: z.number().int().positive('Term must be a positive number of months'),
  monthlyRepayment: z.number().positive('Monthly repayment must be positive'),
  startedOn: IsoDate,
  termsEffectiveFrom: IsoDate,
});

/** Wire shape of a `loan_rate_history` row. */
export const LoanRateSchema = z.object({
  id: z.string(),
  loanAccountId: z.string(),
  annualRatePct: z.number(),
  effectiveFrom: z.string(),
  source: z.enum(LOAN_RATE_SOURCES),
  createdAt: z.string(),
});

const RecordLoanRateBody = z.object({
  annualRatePct: z.number().min(0, 'Annual rate cannot be negative'),
  effectiveFrom: IsoDate,
  source: z.enum(LOAN_RATE_SOURCES).optional(),
});

/** Wire shape of a `loan_offset_links` row. */
export const LoanOffsetLinkSchema = z.object({
  id: z.string(),
  loanAccountId: z.string(),
  offsetAccountId: z.string(),
  linkedFrom: z.string(),
  unlinkedAt: z.string().nullable(),
  createdAt: z.string(),
});

const LinkOffsetAccountBody = z.object({
  offsetAccountId: z.string().min(1, 'Offset account id is required'),
  linkedFrom: IsoDate,
});

const OffsetLinksQuery = z.object({ active: z.enum(['true', 'false']).optional() });

const LoanTermsMutation = z.object({ data: LoanTermsSchema, message: z.string() });
const LoanRateMutation = z.object({ data: LoanRateSchema, message: z.string() });
const LoanOffsetLinkMutation = z.object({ data: LoanOffsetLinkSchema, message: z.string() });

export const financeLoanContract = c.router({
  getTerms: {
    method: 'GET',
    path: '/accounts/:id/loan-terms',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: LoanTermsSchema }), ...ERR_RESPONSES_WITH_422 },
    summary: 'Read a loan account’s terms',
  },
  writeTerms: {
    method: 'PUT',
    path: '/accounts/:id/loan-terms',
    pathParams: z.object({ id: z.string() }),
    body: WriteLoanTermsBody,
    responses: { 200: LoanTermsMutation, ...ERR_RESPONSES_WITH_422 },
    summary:
      'Create or replace a loan account’s terms, recording the matching rate history row atomically',
  },
  listRateHistory: {
    method: 'GET',
    path: '/accounts/:id/loan-rate-history',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({ data: z.array(LoanRateSchema) }),
      ...ERR_RESPONSES_WITH_422,
    },
    summary: 'List every rate a loan account has carried, newest effective date first',
  },
  recordRate: {
    method: 'POST',
    path: '/accounts/:id/loan-rate-history',
    pathParams: z.object({ id: z.string() }),
    body: RecordLoanRateBody,
    responses: { 201: LoanRateMutation, ...ERR_RESPONSES_WITH_422 },
    summary:
      'Record a rate change and mirror it onto the loan’s terms; 422s a non-latest effectiveFrom',
  },
  listOffsetLinks: {
    method: 'GET',
    path: '/accounts/:id/loan-offset-links',
    pathParams: z.object({ id: z.string() }),
    query: OffsetLinksQuery,
    responses: {
      200: z.object({ data: z.array(LoanOffsetLinkSchema) }),
      ...ERR_RESPONSES_WITH_422,
    },
    summary: 'List a loan account’s offset links, closed ones included unless active=true',
  },
  linkOffsetAccount: {
    method: 'POST',
    path: '/accounts/:id/loan-offset-links',
    pathParams: z.object({ id: z.string() }),
    body: LinkOffsetAccountBody,
    responses: { 201: LoanOffsetLinkMutation, ...ERR_RESPONSES_WITH_422 },
    summary: 'Link an offset account to a loan account; any existing account may be the offset',
  },
  unlinkOffsetAccount: {
    method: 'POST',
    path: '/accounts/:id/loan-offset-links/:linkId/unlink',
    pathParams: z.object({ id: z.string(), linkId: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: LoanOffsetLinkMutation, ...ERR_RESPONSES_WITH_422 },
    summary: 'Close an offset link (sets unlinkedAt) without deleting it; idempotent',
  },
});
