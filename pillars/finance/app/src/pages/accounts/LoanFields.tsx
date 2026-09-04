import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { DateInput, Label, NumberInput } from '@pops/ui';

import { FinanceApiError, unwrap } from '../../finance-api-helpers.js';
import { loanGetTerms } from '../../finance-api/index.js';
import { LoanRateHistorySection } from './LoanRateHistorySection';
import { loanTermsKey } from './useAccountMutations';

import type { AccountFormValues } from './types';

/** `loanGetTerms` 404s for a loan account that has never had terms recorded — that is the normal, empty state, not a failure. */
function useExistingLoanTerms(accountId: string | undefined) {
  return useQuery({
    queryKey: loanTermsKey(accountId ?? ''),
    queryFn: async () => {
      try {
        return await unwrap(await loanGetTerms({ path: { id: accountId ?? '' } })).data;
      } catch (err) {
        if (err instanceof FinanceApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: accountId !== undefined,
  });
}

function numberField(
  form: UseFormReturn<AccountFormValues>,
  name: keyof AccountFormValues,
  label: string,
  suffix?: string
) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div className="flex flex-col gap-1.5">
          <Label>{label}</Label>
          <NumberInput
            value={typeof field.value === 'number' ? field.value : ''}
            suffix={suffix}
            onChange={(e) => {
              const next = e.currentTarget.value;
              field.onChange(next === '' ? null : Number(next));
            }}
            aria-label={label}
          />
        </div>
      )}
    />
  );
}

/**
 * Principal, rate, term and repayment for a `loan`-kind account (POPS-2846),
 * backed by the real `loan-terms`/`loan-rate-history` sub-resources
 * (POPS-2829). Modelled on `GiftCardFields`: terms are optional — a loan
 * account with none is valid (the insight modules render an empty state for
 * it) — so `useAccountsPage`'s `loanTermsPartiallyFilled` guard, not this
 * component, is what stops a half-filled set from being submitted.
 */
export function LoanFields({
  form,
  accountId,
}: {
  form: UseFormReturn<AccountFormValues>;
  accountId?: string;
}) {
  const existing = useExistingLoanTerms(accountId);

  useEffect(() => {
    if (!existing.data) return;
    const dirty = form.formState.dirtyFields;
    if (!dirty.loanOriginalPrincipal)
      form.setValue('loanOriginalPrincipal', existing.data.originalPrincipal);
    if (!dirty.loanAnnualRatePct) form.setValue('loanAnnualRatePct', existing.data.annualRatePct);
    if (!dirty.loanTermMonths) form.setValue('loanTermMonths', existing.data.termMonths);
    if (!dirty.loanMonthlyRepayment)
      form.setValue('loanMonthlyRepayment', existing.data.monthlyRepayment);
    if (!dirty.loanStartedOn) form.setValue('loanStartedOn', existing.data.startedOn);
    if (!dirty.loanTermsEffectiveFrom)
      form.setValue('loanTermsEffectiveFrom', existing.data.termsEffectiveFrom);
  }, [existing.data, form]);

  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Loan terms</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {numberField(form, 'loanOriginalPrincipal', 'Original principal')}
        {numberField(form, 'loanAnnualRatePct', 'Annual rate', '%')}
        {numberField(form, 'loanTermMonths', 'Term (months)')}
        {numberField(form, 'loanMonthlyRepayment', 'Monthly repayment')}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-started-on">Started on</Label>
          <DateInput id="loan-started-on" {...form.register('loanStartedOn')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-terms-effective-from">Terms effective from</Label>
          <DateInput id="loan-terms-effective-from" {...form.register('loanTermsEffectiveFrom')} />
        </div>
      </div>
      {accountId && existing.data && <LoanRateHistorySection accountId={accountId} />}
    </fieldset>
  );
}
