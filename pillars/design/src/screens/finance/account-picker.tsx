import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { AccountSelect } from '@/kit/account-select';

import { Label, PageHeader, Select } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Account picker', order: 5, frame: 'web' };

const DIALECTS = [
  { value: 'anz', label: 'ANZ CSV' },
  { value: 'amex', label: 'American Express CSV' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Surfaces({
  accounts,
  selectedId,
  demoArchivedRevealed,
}: {
  accounts: Account[];
  selectedId?: string;
  demoArchivedRevealed?: boolean;
}) {
  return (
    <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
      <Field label="Transaction form">
        <AccountSelect accounts={accounts} initialId={selectedId} ariaLabel="Account" />
      </Field>
      <Field label="Transaction list filter">
        <AccountSelect
          accounts={accounts}
          ariaLabel="Account filter"
          clearable
          placeholder="All accounts"
          defaultOpen={demoArchivedRevealed}
          defaultArchivedRevealed={demoArchivedRevealed}
        />
      </Field>
      <Field label="Import wizard · account">
        <AccountSelect accounts={accounts} initialId={selectedId} ariaLabel="Account" />
        <p className="text-xs text-muted-foreground">
          Chosen separately from the bank export dialect below.
        </p>
        <Select label="Bank dialect" options={DIALECTS} defaultValue="anz" />
      </Field>
      <div className="space-y-2">
        <Label>Review row · inline edit</Label>
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>SQ *THE GROUNDS OF ALEX</span>
            <span className="tabular-nums">-21.50</span>
          </div>
          <AccountSelect accounts={accounts} initialId={accounts[1]?.id} ariaLabel="Account" />
        </div>
      </div>
    </div>
  );
}

function NoAccountsNotice() {
  return (
    <div className="max-w-md rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      No accounts yet.{' '}
      <a href="#accounts" className="text-primary underline">
        Create one
      </a>{' '}
      before importing — every transaction is filed against an account.
    </div>
  );
}

/** The picker as a searchable popover — the `EntitySelect` shape. */
export function AccountPicker({
  accounts,
  selectedId,
  demoArchivedRevealed,
}: {
  accounts: Account[];
  selectedId?: string;
  demoArchivedRevealed?: boolean;
}) {
  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Account picker"
        description="A searchable popover, the same control on every surface that used to take typed text."
      />
      <Surfaces
        accounts={accounts}
        selectedId={selectedId}
        demoArchivedRevealed={demoArchivedRevealed}
      />
      {accounts.length === 0 && <NoAccountsNotice />}
    </div>
  );
}

const active = allAccounts.filter((a) => !a.archived);

export const states: ScreenStates = {
  empty: () => <AccountPicker accounts={active} />,
  'archived-revealed': () => (
    <AccountPicker accounts={allAccounts} selectedId="a2" demoArchivedRevealed />
  ),
  'no-accounts-yet': () => <AccountPicker accounts={[]} />,
};

export default function AccountPickerScreen() {
  return <AccountPicker accounts={active} selectedId="a2" />;
}
