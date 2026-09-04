import { type AccountKind, ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';
import {
  AccountListControls,
  NoAccountsYet,
  NoMatchingAccounts,
  useAccountListFilters,
} from '@/kit/account-list-controls';
import { balanceTone } from '@/kit/ledger-tone';
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
    <span className="block shrink-0 text-right">
      <span className={cn('block text-base font-semibold tabular-nums', balanceTone(account))}>
        {formatBalance(account.balance, account.currency)}
      </span>
      {note !== '' && <span className="block text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

function AccountCard({ account }: { account: Account }) {
  return (
    <div className="group relative">
      <GripVertical
        className="absolute top-1/2 left-2 z-10 h-4 w-4 -translate-y-1/2 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50"
        aria-label="Reorder"
      />
      <a
        href={`#/accounts/${account.id}`}
        className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Card
          className={cn(
            'flex-row items-center gap-3 py-3 pr-4 pl-8 transition-colors hover:border-primary hover:bg-muted/50',
            account.archived && 'border-dashed opacity-60'
          )}
        >
          <AccountAvatar account={account} size="md" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{account.name}</span>
              {account.archived && (
                <Badge variant="outline" className="text-xs">
                  Archived
                </Badge>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {subtitle(account)} · {account.transactionCount.toLocaleString('en-AU')} transactions
            </span>
          </span>
          <Balance account={account} />
        </Card>
      </a>
    </div>
  );
}

function KindSection({ kind, accounts }: { kind: AccountKind; accounts: Account[] }) {
  const meta = ACCOUNT_KINDS[kind];
  const Icon = meta.icon;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {meta.label}
      </h2>
      <div className="space-y-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </section>
  );
}

/** The accounts management list as cards grouped by kind — display order sorts within a group. */
export function AccountsPage({
  accounts,
  initialQuery,
}: {
  accounts: Account[];
  initialQuery?: string;
}) {
  const filters = useAccountListFilters(accounts, initialQuery);
  const kinds = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).filter((kind) =>
    filters.visible.some((a) => a.kind === kind)
  );
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
            <div className="max-w-3xl space-y-6">
              {kinds.map((kind) => (
                <KindSection
                  key={kind}
                  kind={kind}
                  accounts={filters.visible.filter((a) => a.kind === kind)}
                />
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
