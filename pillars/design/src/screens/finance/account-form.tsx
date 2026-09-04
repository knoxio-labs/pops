import { insightsByAccountId } from '@/fixtures/account-insights';
import { type AccountKind, ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import {
  AvatarField,
  type Counterparty,
  CounterpartySelect,
  GiftCardSection,
} from '@/kit/account-fields';
import { KIND_OPTIONS, useAccountFormState } from '@/kit/account-form-state';
import { CurrencySelect } from '@/kit/currency-select';
import { InstitutionMark } from '@/kit/institution-select';
import { LoanOffsetLinksSection } from '@/kit/loan-offset-links-section';
import { LoanTermsSection } from '@/kit/loan-terms-section';
import { type ReactNode } from 'react';

import {
  Button,
  ComboboxSelect,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  TextInput,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account form', order: 3, frame: 'web' };

function Hint({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-xs text-muted-foreground">{children}</p>;
}

function AccountMark({ kind, counterparty }: { kind: AccountKind; counterparty?: Counterparty }) {
  if (counterparty) return <InstitutionMark institution={counterparty} />;
  const Icon = ACCOUNT_KINDS[kind].icon;
  return <Icon className="h-6 w-6 text-muted-foreground" />;
}

type FormState = ReturnType<typeof useAccountFormState>;

function KindSpecificFields({ f, account }: { f: FormState; account?: Account }) {
  return (
    <>
      {f.kind === 'cash' && (
        <Hint>
          Cash can have more than one account per currency — a wallet and a piggy bank both work.
        </Hint>
      )}
      {f.kind === 'gift-card' && <GiftCardSection account={account} />}
      {f.kind === 'loan' && (
        <>
          <LoanTermsSection
            account={account}
            insight={account && insightsByAccountId[account.id]}
          />
          <LoanOffsetLinksSection account={account} />
        </>
      )}
    </>
  );
}

function FormFields({
  f,
  account,
  institutionQuery,
  currencyCreateQuery,
}: {
  f: FormState;
  account?: Account;
  institutionQuery?: string;
  currencyCreateQuery?: string;
}) {
  const selectedCounterparty = f.counterpartyOptions.find((c) => c.id === f.counterpartyId);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Kind</Label>
        <ComboboxSelect
          options={KIND_OPTIONS}
          value={f.kind}
          onChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            if (next !== undefined) f.setKind(next as AccountKind);
          }}
        />
      </div>
      <AvatarField mark={<AccountMark kind={f.kind} counterparty={selectedCounterparty} />} />
      <TextInput
        label="Name"
        value={f.name}
        onChange={(e) => f.setName(e.target.value)}
        placeholder="Everyday"
      />
      <CounterpartySelect
        mode={f.counterpartyMode}
        options={f.counterpartyOptions}
        selected={selectedCounterparty}
        onSelect={f.selectCounterparty}
        onCreate={f.createCounterparty}
        initialQuery={f.counterpartyMode === 'institution' ? institutionQuery : undefined}
      />
      {f.kind === 'person' && <Hint>A positive balance means they owe you.</Hint>}
      <CurrencySelect
        options={f.currencyPool.options}
        code={f.currencyCode}
        onChange={f.setCurrencyCode}
        onCreate={f.createCurrency}
        initialCreateQuery={currencyCreateQuery}
      />
      <KindSpecificFields f={f} account={account} />
    </div>
  );
}

function AccountForm({
  account,
  initialKind,
  initialCurrency,
  institutionQuery,
  currencyCreateQuery,
}: {
  account?: Account;
  initialKind?: AccountKind;
  initialCurrency?: string;
  institutionQuery?: string;
  currencyCreateQuery?: string;
}) {
  const f = useAccountFormState(account, initialKind, initialCurrency);
  return (
    <Dialog open>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : 'Add account'}</DialogTitle>
        </DialogHeader>
        <FormFields
          f={f}
          account={account}
          institutionQuery={institutionQuery}
          currencyCreateQuery={currencyCreateQuery}
        />
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>{account ? 'Save' : 'Create account'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const byId = (id: string) => allAccounts.find((a) => a.id === id);

export const states: ScreenStates = {
  'edit-credit-card': () => <AccountForm account={byId('a2')} />,
  'gift-card': () => <AccountForm account={byId('a6')} />,
  loan: () => <AccountForm account={byId('a11')} />,
  'new-loan': () => <AccountForm initialKind="loan" />,
  'loan-no-offsets': () => <AccountForm account={byId('a12')} />,
  person: () => <AccountForm account={byId('a7')} />,
  'second-cash': () => <AccountForm initialKind="cash" />,
  'points-currency': () => <AccountForm initialKind="other" initialCurrency="MR" />,
  'new-institution': () => <AccountForm institutionQuery="Revolut" />,
  'create-currency': () => <AccountForm currencyCreateQuery="Velocity Points" />,
};

export default function AccountFormScreen() {
  return <AccountForm />;
}
