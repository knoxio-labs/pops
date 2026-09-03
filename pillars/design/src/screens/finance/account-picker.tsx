import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';

import { Badge, Button, cn, Label, PageHeader, Select } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account picker', order: 5, frame: 'web' };

const DIALECTS = [
  { value: 'anz', label: 'ANZ CSV' },
  { value: 'amex', label: 'American Express CSV' },
];

function AccountLine({ account, selected }: { account: Account; selected: boolean }) {
  const kind = ACCOUNT_KINDS[account.kind];
  const Icon = kind.icon;
  return (
    <span className="flex w-full items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">{account.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {account.currency}
      </span>
      {account.archived && (
        <Badge variant="outline" className="shrink-0 text-xs">
          Archived
        </Badge>
      )}
      <Check className={cn('h-4 w-4 shrink-0', !selected && 'invisible')} aria-hidden />
    </span>
  );
}

function Trigger({ account }: { account?: Account }) {
  const kind = account ? ACCOUNT_KINDS[account.kind] : undefined;
  const Icon = kind?.icon;
  return (
    <Button variant="outline" className="w-full justify-between font-normal">
      <span className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <span className={cn('truncate', !account && 'text-muted-foreground')}>
          {account?.name ?? 'Select account'}
        </span>
      </span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
    </Button>
  );
}

function ListFooter({ hiddenArchived }: { hiddenArchived: number }) {
  return (
    <div className="border-t border-border pt-1">
      {hiddenArchived > 0 && (
        <Button variant="ghost" size="sm" className="w-full justify-start font-normal">
          Show {hiddenArchived} archived
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start font-normal"
        prefix={<Plus className="h-4 w-4" />}
      >
        New account
      </Button>
    </div>
  );
}

/**
 * The open popover, rendered inline rather than in a portal so a design can be
 * looked at without being driven. The shipping picker is a `ComboboxSelect`.
 */
function OpenList({
  accounts,
  selectedId,
  query,
  archivedRevealed,
}: {
  accounts: Account[];
  selectedId?: string;
  query?: string;
  archivedRevealed: boolean;
}) {
  const matching = query
    ? accounts.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : accounts;
  const visible = matching.filter((a) => archivedRevealed || !a.archived);
  const hiddenArchived = matching.filter((a) => a.archived).length;
  return (
    <div className="w-72 rounded-md border border-border bg-popover p-1 shadow-md">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className={cn('text-sm', !query && 'text-muted-foreground')}>
          {query ?? 'Search accounts…'}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No account matches “{query}”.
        </div>
      ) : (
        <ul className="py-1">
          {visible.map((account) => (
            <li
              key={account.id}
              className={cn(
                'rounded-sm px-2 py-1.5',
                account.id === selectedId && 'bg-accent text-accent-foreground'
              )}
            >
              <AccountLine account={account} selected={account.id === selectedId} />
            </li>
          ))}
        </ul>
      )}
      <ListFooter hiddenArchived={archivedRevealed ? 0 : hiddenArchived} />
    </div>
  );
}

function Surfaces({ accounts, selected }: { accounts: Account[]; selected?: Account }) {
  return (
    <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Transaction form</Label>
        <Trigger account={selected} />
      </div>
      <div className="space-y-2">
        <Label>Transaction list filter</Label>
        <Trigger />
      </div>
      <div className="space-y-2">
        <Label>Import wizard · account</Label>
        <Trigger account={selected} />
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
          <Trigger account={accounts[1]} />
        </div>
      </div>
    </div>
  );
}

/** The picker as a searchable popover — the `EntitySelect` shape. */
export function AccountPicker({
  accounts,
  selected,
  open,
  query,
  archivedRevealed = false,
}: {
  accounts: Account[];
  selected?: Account;
  open?: boolean;
  query?: string;
  archivedRevealed?: boolean;
}) {
  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Account picker"
        description="A searchable popover, the same control on every surface that used to take typed text."
      />
      <Surfaces accounts={accounts} selected={selected} />
      {open && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase">Open</h2>
          <OpenList
            accounts={accounts}
            selectedId={selected?.id}
            query={query}
            archivedRevealed={archivedRevealed}
          />
        </section>
      )}
      {accounts.length === 0 && (
        <div className="max-w-md rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No accounts yet.{' '}
          <a href="#accounts" className="text-primary underline">
            Create one
          </a>{' '}
          before importing — every transaction is filed against an account.
        </div>
      )}
    </div>
  );
}

const active = allAccounts.filter((a) => !a.archived);
const byId = (id: string) => allAccounts.find((a) => a.id === id);

export const states: ScreenStates = {
  empty: () => <AccountPicker accounts={active} />,
  open: () => <AccountPicker accounts={allAccounts} selected={byId('a2')} open />,
  searching: () => <AccountPicker accounts={allAccounts} selected={byId('a2')} open query="anz" />,
  'no-match': () => <AccountPicker accounts={allAccounts} open query="revolut" />,
  'archived-revealed': () => <AccountPicker accounts={allAccounts} open archivedRevealed />,
  'no-accounts-yet': () => <AccountPicker accounts={[]} />,
};

export default function AccountPickerScreen() {
  return <AccountPicker accounts={active} selected={byId('a2')} />;
}
