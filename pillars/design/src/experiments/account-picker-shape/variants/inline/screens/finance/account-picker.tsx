import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { Archive, Plus } from 'lucide-react';

import { Badge, Button, cn, Label, PageHeader, Select } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account picker', order: 5, frame: 'web' };

const DIALECTS = [
  { value: 'anz', label: 'ANZ CSV' },
  { value: 'amex', label: 'American Express CSV' },
];

/**
 * One account as a pressable choice. There is no popover: with a handful of
 * accounts the whole set fits on screen, and a choice you can see is faster
 * than one you have to open and search.
 */
function AccountOption({ account, selected }: { account: Account; selected: boolean }) {
  const kind = ACCOUNT_KINDS[account.kind];
  const Icon = kind.icon;
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
        account.archived && 'border-dashed opacity-60'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{account.name}</span>
      <span className="text-xs tabular-nums opacity-70">{account.currency}</span>
      {account.archived && (
        <Badge variant="outline" className="text-xs">
          Archived
        </Badge>
      )}
    </button>
  );
}

function AccountRow({
  accounts,
  selectedId,
  archivedRevealed,
}: {
  accounts: Account[];
  selectedId?: string;
  archivedRevealed: boolean;
}) {
  const visible = accounts.filter((a) => archivedRevealed || !a.archived);
  const hiddenArchived = accounts.filter((a) => a.archived).length;
  if (accounts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No accounts yet.{' '}
        <a href="#accounts" className="text-primary underline">
          Create one
        </a>{' '}
        before importing — every transaction is filed against an account.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((account) => (
        <AccountOption key={account.id} account={account} selected={account.id === selectedId} />
      ))}
      {!archivedRevealed && hiddenArchived > 0 && (
        <Button variant="ghost" size="sm" prefix={<Archive className="h-4 w-4" />}>
          {hiddenArchived} archived
        </Button>
      )}
      <Button variant="ghost" size="sm" prefix={<Plus className="h-4 w-4" />}>
        New
      </Button>
    </div>
  );
}

function Surfaces({
  accounts,
  selectedId,
  archivedRevealed,
}: {
  accounts: Account[];
  selectedId?: string;
  archivedRevealed: boolean;
}) {
  const row = (id?: string) => (
    <AccountRow accounts={accounts} selectedId={id} archivedRevealed={archivedRevealed} />
  );
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <Label>Transaction form</Label>
        {row(selectedId)}
      </div>
      <div className="space-y-2">
        <Label>Transaction list filter</Label>
        {row(undefined)}
      </div>
      <div className="space-y-2">
        <Label>Import wizard · account</Label>
        {row(selectedId)}
        <p className="text-xs text-muted-foreground">
          Chosen separately from the bank export dialect below.
        </p>
        <Select label="Bank dialect" options={DIALECTS} defaultValue="anz" />
      </div>
      <div className="space-y-2">
        <Label>Review row · inline edit</Label>
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>SQ *THE GROUNDS OF ALEX</span>
            <span className="tabular-nums">-21.50</span>
          </div>
          {row(accounts[1]?.id)}
        </div>
      </div>
    </div>
  );
}

/** The picker as an inline row of choices — no popover, no search. */
export function AccountPicker({
  accounts,
  selected,
  archivedRevealed = false,
}: {
  accounts: Account[];
  selected?: Account;
  archivedRevealed?: boolean;
}) {
  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Account picker"
        description="Every account visible at once; picking one is a single click with nothing to open."
      />
      <Surfaces accounts={accounts} selectedId={selected?.id} archivedRevealed={archivedRevealed} />
    </div>
  );
}

const active = allAccounts.filter((a) => !a.archived);
const byId = (id: string) => allAccounts.find((a) => a.id === id);

/**
 * No `searching` or `no-match` state: this variant has no search, which is the
 * whole of what it proposes. A state that rendered the same page twice would
 * hide that rather than show it.
 */
export const states: ScreenStates = {
  empty: () => <AccountPicker accounts={active} />,
  'archived-revealed': () => <AccountPicker accounts={allAccounts} archivedRevealed />,
  'no-accounts-yet': () => <AccountPicker accounts={[]} />,
};

export default function AccountPickerScreen() {
  return <AccountPicker accounts={active} selected={byId('a2')} />;
}
