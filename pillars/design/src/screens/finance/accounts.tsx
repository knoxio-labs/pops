import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';
import {
  AccountListControls,
  NoAccountsYet,
  NoMatchingAccounts,
  useAccountListFilters,
} from '@/kit/account-list-controls';
import { currencySubtotals } from '@/kit/account-subtotals';
import { balanceTone, ledgerTone } from '@/kit/ledger-tone';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Plus } from 'lucide-react';

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
  return `as of ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

/**
 * A person ledger is the one balance whose sign does not say enough on its
 * own: red says you are down, not who you are down to. Every other kind reads
 * off the number and its colour, so it gets no direction word.
 */
function ledgerNote(account: Account): string {
  if (account.kind !== 'person') return '';
  if (account.balance === 0) return 'settled up';
  return account.balance < 0 ? 'you owe' : 'owed to you';
}

function subline(account: Account): string {
  return [ledgerNote(account), asOfLabel(account)].filter(Boolean).join(' · ');
}

function Balance({ account }: { account: Account }) {
  const note = subline(account);
  return (
    <span className="block">
      <span className={cn('block text-2xl font-semibold tabular-nums', balanceTone(account))}>
        {formatBalance(account.balance, account.currency)}
      </span>
      {note !== '' && <span className="block text-xs text-muted-foreground">{note}</span>}
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
    <div className="relative h-full">
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

/**
 * One figure per currency in play, never blended into a single number
 * (POPS-2813): AUD and EUR cannot be added without an exchange rate, and
 * there is no rate source or staleness story yet. Points never appear here —
 * they are not money. A single currency still gets its label, so the reader
 * never has to infer what unit the number is in from the accounts below it.
 */
function Subtotals({ accounts }: { accounts: Account[] }) {
  const totals = currencySubtotals(accounts);
  if (totals.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b pb-4">
      {totals.map(({ currency, total }) => (
        <span key={currency} className="flex items-baseline gap-1.5">
          <span className={cn('text-lg font-semibold tabular-nums', ledgerTone(total))}>
            {formatBalance(total, currency)}
          </span>
          <span className="text-xs text-muted-foreground">{currency}</span>
        </span>
      ))}
      <span className="text-xs text-muted-foreground">
        Held minus owed, per currency — points are not counted, and nothing is converted.
      </span>
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
          <Subtotals accounts={accounts} />
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
