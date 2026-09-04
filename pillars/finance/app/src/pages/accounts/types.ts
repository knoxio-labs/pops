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
};

/** Kinds with no issuing institution — `rest-accounts.ts`: null for cash and person accounts. */
export function hasInstitution(kind: AccountFormValues['kind']): boolean {
  return kind !== 'cash' && kind !== 'person';
}
