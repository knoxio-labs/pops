import { type AccountKind, ACCOUNT_KINDS, sideNoun } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { Archive, GripVertical, Landmark, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, cn, EmptyState, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Accounts', order: 2, frame: 'web' };

function AccountIdentity({ account }: { account: Account }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{account.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {account.currency}
        </span>
        {account.archived && (
          <Badge variant="outline" className="text-xs">
            Archived
          </Badge>
        )}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {account.institution ?? account.contact ?? 'No institution'}
        {account.historyCompleteFrom ? ` · complete from ${account.historyCompleteFrom}` : ''}
      </span>
    </span>
  );
}

function AccountCard({ account }: { account: Account }) {
  const kind = ACCOUNT_KINDS[account.kind];
  const Icon = kind.icon;
  return (
    <Card
      className={cn(
        'group flex-row items-center gap-3 px-4 py-3',
        account.archived && 'border-dashed opacity-60'
      )}
    >
      <GripVertical
        className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50"
        aria-label="Reorder"
      />
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <AccountIdentity account={account} />
      <span className="shrink-0 text-right">
        <span className="block text-sm text-muted-foreground">
          {kind.checkpointable ? 'No checkpoint yet' : 'Not checkpointed'}
        </span>
        <Button variant="ghost" size="sm" className="mt-1">
          Edit
        </Button>
      </span>
    </Card>
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
        <span className="font-normal normal-case">· {sideNoun(meta.side)}</span>
      </h2>
      <div className="space-y-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </section>
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

/** The accounts management list as cards grouped by kind — display order sorts within a group. */
export function AccountsPage({ accounts }: { accounts: Account[] }) {
  const list = useAccountsList(accounts);
  const kinds = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).filter((kind) =>
    list.visible.some((a) => a.kind === kind)
  );
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
          <div className="max-w-3xl space-y-6">
            {kinds.map((kind) => (
              <KindSection
                key={kind}
                kind={kind}
                accounts={list.visible.filter((a) => a.kind === kind)}
              />
            ))}
          </div>
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
