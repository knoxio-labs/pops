import { z } from 'zod';

import { ACCOUNT_KINDS, DAY_ONE_ACCOUNT_KINDS } from '@pops/finance';

import type { AccountsListResponses, InstitutionsListResponses } from '../../finance-api/index.js';

export type Account = AccountsListResponses[200]['data'][number];
export type Institution = InstitutionsListResponses[200]['data'][number];

export function isDayOneKind(kind: string): boolean {
  return (DAY_ONE_ACCOUNT_KINDS as readonly string[]).includes(kind);
}

/** Every selectable kind, day-one ones enabled, reserved ones present but disabled. */
export const KIND_FORM_OPTIONS = ACCOUNT_KINDS.map((kind) => ({
  value: kind,
  disabled: !isDayOneKind(kind),
}));

export const AccountFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(ACCOUNT_KINDS),
  institutionId: z.string().nullable(),
  currency: z.string().min(1, 'Currency is required'),
  giftCardNumber: z.string(),
  giftCardPin: z.string(),
  giftCardExpiresOn: z.string(),
  loanOriginalPrincipal: z.number().nullable(),
  loanAnnualRatePct: z.number().nullable(),
  loanTermMonths: z.number().nullable(),
  loanMonthlyRepayment: z.number().nullable(),
  loanStartedOn: z.string(),
  loanTermsEffectiveFrom: z.string(),
});

export type AccountFormValues = z.infer<typeof AccountFormSchema>;

export const DEFAULT_ACCOUNT_FORM_VALUES: AccountFormValues = {
  name: '',
  kind: 'checking',
  institutionId: null,
  currency: '',
  giftCardNumber: '',
  giftCardPin: '',
  giftCardExpiresOn: '',
  loanOriginalPrincipal: null,
  loanAnnualRatePct: null,
  loanTermMonths: null,
  loanMonthlyRepayment: null,
  loanStartedOn: '',
  loanTermsEffectiveFrom: '',
};

/** Every loan-terms field the write form owns, for the all-or-nothing check below. */
const LOAN_TERMS_FIELDS = [
  'loanOriginalPrincipal',
  'loanAnnualRatePct',
  'loanTermMonths',
  'loanMonthlyRepayment',
  'loanStartedOn',
  'loanTermsEffectiveFrom',
] as const satisfies readonly (keyof AccountFormValues)[];

function isLoanFieldFilled(values: AccountFormValues, field: (typeof LOAN_TERMS_FIELDS)[number]) {
  const v = values[field];
  return typeof v === 'string' ? v !== '' : v !== null;
}

/** True once every loan-terms field carries a value — the shape `writeLoanTerms` can send. */
export function hasCompleteLoanTermsInput(values: AccountFormValues): boolean {
  return LOAN_TERMS_FIELDS.every((field) => isLoanFieldFilled(values, field));
}

/**
 * True when loan terms are started but not finished — some fields filled, not
 * all. Submitting an account in this state would silently drop the partial
 * terms (`writeLoanTerms` only fires once every field is present), so the
 * caller should block the submit and point at what's missing instead.
 */
export function loanTermsPartiallyFilled(values: AccountFormValues): boolean {
  if (values.kind !== 'loan') return false;
  const filled = LOAN_TERMS_FIELDS.filter((field) => isLoanFieldFilled(values, field));
  return filled.length > 0 && filled.length < LOAN_TERMS_FIELDS.length;
}

/** Kinds with no issuing institution — `rest-accounts.ts`: null for cash and person accounts. */
export function hasInstitution(kind: AccountFormValues['kind']): boolean {
  return kind !== 'cash' && kind !== 'person';
}
