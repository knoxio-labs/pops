import { ACCOUNT_KINDS, sideNoun } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';
import {
  AccountListControls,
  NoAccountsYet,
  NoMatchingAccounts,
  useAccountListFilters,
} from '@/kit/account-list-controls';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { GripVertical, Plus } from 'lucide-react';

import { Badge, Button, Card, cn, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Accounts', order: 2, frame: 'web' };

function subtitle(account: Account): string {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)?.name
    : undefined;
  return institution ?? account.contact ?? ACCOUNT_KINDS[account.kind].label;
}

function asOfLabel(account: Account): string {
  if (!account.balanceAsOf) return '';
  const date = new Date(`${account.balanceAsOf}T00:00:00`);
  return ` · as of ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

function balanceMeaning(account: Account): { note: string; tone: string } {
  const { side } = ACCOUNT_KINDS[account.kind];
  if (side === 'either') {
    const owing = account.balance < 0;
    return {
      note: owing ? 'you owe' : 'owed to you',
      tone: owing ? 'text-destructive' : 'text-foreground',
    };
  }
  const owed = side === 'liability' && account.balance > 0;
  return { note: sideNoun(side), tone: owed ? 'text-destructive' : 'text-foreground' };
}

function Balance({ account }: { account: Account }) {
  const { side } = ACCOUNT_KINDS[account.kind];
  const meaning = balanceMeaning(account);
  const amount = side === 'either' ? Math.abs(account.balance) : account.balance;
  return (
    <span className="block">
      <span className={cn('block text-2xl font-semibold tabular-nums', meaning.tone)}>
        {formatBalance(amount, account.currency)}
      </span>
      <span className="block text-xs text-muted-foreground">
        {meaning.note}
        {asOfLabel(account)}
      </span>
    </span>
  );
}

function CardHead({ account }: { account: Account }) {
  return (
    <span className="flex items-start gap-3">
      <AccountAvatar account={account} size="md" />
      <span className="min-w-0 flex-1 pr-5">
        <span className="block truncate text-sm font-medium">{account.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle(account)}</span>
      </span>
    </span>
  );
}

function AccountTile({ account }: { account: Account }) {
  return (
    <div className="group relative h-full">
      <GripVertical
        className="absolute top-4 right-4 z-10 h-4 w-4 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50"
        aria-label="Reorder"
      />
      <a
        href={`#/accounts/${account.id}`}
        className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Card
          className={cn(
            'h-full gap-4 px-4 py-4 transition-colors hover:border-primary hover:bg-muted/50',
            account.archived && 'border-dashed opacity-60'
          )}
        >
          <CardHead account={account} />
          <Balance account={account} />
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {ACCOUNT_KINDS[account.kind].label}
            </Badge>
            <span className="tabular-nums">
              {account.transactionCount.toLocaleString('en-AU')} transactions
            </span>
            {account.archived && <span className="ml-auto">Archived</span>}
          </span>
        </Card>
      </a>
    </div>
  );
}

/** The accounts management list as a card grid, two or three across, balance first. */
export function AccountsPage({
  accounts,
  initialQuery,
}: {
  accounts: Account[];
  initialQuery?: string;
}) {
  const filters = useAccountListFilters(accounts, initialQuery);
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Accounts"
        description={filters.description}
        actions={<Button prefix={<Plus className="h-4 w-4" />}>Add account</Button>}
      />
      {accounts.length === 0 && <NoAccountsYet />}
      {accounts.length > 0 && (
        <>
          <AccountListControls filters={filters} />
          {filters.visible.length === 0 && <NoMatchingAccounts onClear={filters.clear} />}
          {filters.visible.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filters.visible.map((account) => (
                <AccountTile key={account.id} account={account} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <AccountsPage accounts={[]} />,
  'fresh-install': () => <AccountsPage accounts={allAccounts.slice(0, 1)} />,
  'no-archived': () => <AccountsPage accounts={allAccounts.filter((a) => !a.archived)} />,
  'no-results': () => <AccountsPage accounts={allAccounts} initialQuery="westpac" />,
};

export default function AccountsScreen() {
  return <AccountsPage accounts={allAccounts} />;
}
