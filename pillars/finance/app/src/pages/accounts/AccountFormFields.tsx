import { type ReactNode } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { TextInput } from '@pops/ui';

import { AccountInstitutionField } from './AccountInstitutionField';
import { AccountKindField } from './AccountKindField';
import { CurrencySelect } from './CurrencySelect';
import { GiftCardFields } from './GiftCardFields';
import { LoanFields } from './LoanFields';
import { LoanOffsetLinksSection } from './LoanOffsetLinksSection';
import { type Account, type AccountFormValues } from './types';

import type { CurrenciesListResponses } from '../../finance-api/index.js';
import type { Institution } from './types';

type Currency = CurrenciesListResponses[200]['data'][number];

function Hint({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-xs text-muted-foreground">{children}</p>;
}

export function AccountFormFields({
  form,
  account,
  institutions,
  currencies,
  onCreateInstitution,
}: {
  form: UseFormReturn<AccountFormValues>;
  account: Account | null;
  institutions: Institution[];
  currencies: Currency[];
  onCreateInstitution: (name: string) => void;
}) {
  const kind = form.watch('kind');
  return (
    <div className="space-y-4">
      <AccountKindField form={form} />
      <TextInput
        label="Name"
        placeholder="Everyday"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      {kind === 'person' && (
        <Hint>This name looks up or creates a matching contact for the ledger.</Hint>
      )}
      <AccountInstitutionField
        form={form}
        institutions={institutions}
        onCreate={onCreateInstitution}
      />
      <Controller
        control={form.control}
        name="currency"
        render={({ field }) => (
          <CurrencySelect
            currencies={currencies}
            value={field.value}
            onChange={field.onChange}
            error={form.formState.errors.currency?.message}
          />
        )}
      />
      {kind === 'cash' && (
        <Hint>
          Cash can have more than one account per currency — a wallet and a piggy bank both work.
        </Hint>
      )}
      {kind === 'gift-card' && <GiftCardFields form={form} accountId={account?.id} />}
      {kind === 'loan' && (
        <>
          <LoanFields form={form} accountId={account?.id} />
          {account?.id && <LoanOffsetLinksSection accountId={account.id} />}
        </>
      )}
    </div>
  );
}
