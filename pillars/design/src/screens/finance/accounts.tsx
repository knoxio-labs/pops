import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { Archive, GripVertical, Landmark, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  cn,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Accounts', order: 2, frame: 'web' };

/**
 * The balance cell. POPS-2750 fills it; until a checkpoint exists there is no
 * number to show, and inventing a zero would read as a fact.
 */
function BalanceCell({ account }: { account: Account }) {
  return (
    <span className="text-xs text-muted-foreground">
      {ACCOUNT_KINDS[account.kind].checkpointable ? 'No checkpoint yet' : 'Not checkpointed'}
    </span>
  );
}

function KindCell({ account }: { account: Account }) {
  const kind = ACCOUNT_KINDS[account.kind];
  const Icon = kind.icon;
  return (
    <span className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {kind.label}
    </span>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <TableRow className={cn(account.archived && 'opacity-60')}>
      <TableCell className="w-8 pr-0">
        <GripVertical
          className="h-4 w-4 cursor-grab text-muted-foreground/50"
          aria-label="Reorder"
        />
      </TableCell>
      <TableCell>
        <span className="block text-sm font-medium">{account.name}</span>
        <span className="block text-xs text-muted-foreground">
          {account.institution ?? account.contact ?? '—'}
        </span>
      </TableCell>
      <TableCell>
        <KindCell account={account} />
      </TableCell>
      <TableCell className="text-sm tabular-nums">{account.currency}</TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {account.historyCompleteFrom ?? '—'}
      </TableCell>
      <TableCell>
        <BalanceCell account={account} />
      </TableCell>
      <TableCell className="text-right">
        {account.archived ? (
          <Badge variant="outline" className="text-xs">
            Archived
          </Badge>
        ) : (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function AccountsTable({ accounts }: { accounts: Account[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Account</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead>History from</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead className="text-right">&nbsp;</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </TableBody>
    </Table>
  );
}

function ArchivedToggle({
  count,
  showing,
  onToggle,
}: {
  count: number;
  showing: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <Button
      variant={showing ? 'default' : 'outline'}
      size="sm"
      prefix={<Archive className="h-4 w-4" />}
      onClick={onToggle}
    >
      {showing ? `Hide ${count} archived` : `Show ${count} archived`}
    </Button>
  );
}

function NoAccountsYet() {
  return (
    <EmptyState
      icon={Landmark}
      title="No accounts yet"
      description="Add the accounts you bank with. Every imported transaction is filed against one, so this comes before the first import."
      action={<Button prefix={<Plus className="h-4 w-4" />}>Add your first account</Button>}
    />
  );
}

function useAccountsList(accounts: Account[]) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = accounts.filter((a) => a.archived).length;
  return {
    showArchived,
    archivedCount,
    toggle: () => setShowArchived((prev) => !prev),
    description:
      accounts.length === 0
        ? 'Every transaction belongs to an account.'
        : `${accounts.length - archivedCount} active · ${archivedCount} archived`,
    visible: accounts
      .filter((a) => showArchived || !a.archived)
      .toSorted((a, b) => a.order - b.order),
  };
}

/** The accounts management list as a row per account — the table shape. */
export function AccountsPage({ accounts }: { accounts: Account[] }) {
  const list = useAccountsList(accounts);
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Accounts"
        description={list.description}
        actions={<Button prefix={<Plus className="h-4 w-4" />}>Add account</Button>}
      />
      {accounts.length === 0 ? (
        <NoAccountsYet />
      ) : (
        <>
          <ArchivedToggle
            count={list.archivedCount}
            showing={list.showArchived}
            onToggle={list.toggle}
          />
          <AccountsTable accounts={list.visible} />
        </>
      )}
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <AccountsPage accounts={[]} />,
  'fresh-install': () => <AccountsPage accounts={allAccounts.slice(0, 1)} />,
  'no-archived': () => <AccountsPage accounts={allAccounts.filter((a) => !a.archived)} />,
};

export default function AccountsScreen() {
  return <AccountsPage accounts={allAccounts} />;
}
