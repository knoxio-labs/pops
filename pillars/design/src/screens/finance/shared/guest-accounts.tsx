import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { formatBalance } from '@/fixtures/currencies';
import {
  asGuestSees,
  GUEST_EMAIL,
  type GrantRole,
  guestLedgerNote,
  OPERATOR_EMAIL,
  ROLE_LABEL,
  type SharedAccount,
  sharedAccounts,
} from '@/fixtures/sharing';
import { balanceTone } from '@/kit/ledger-tone';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { GuestChrome } from '@/screens/shell/guest-shell';
import { Eye, Pencil, TriangleAlert, Users } from 'lucide-react';

import { Badge, Button, Card, cn, EmptyState, PageHeader, Skeleton } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

/**
 * The accounts list once it is a guest's. What is gone: Add account, the
 * per-currency subtotals (a guest's two accounts are not a net worth), search
 * and the kind filters, archived accounts, and reordering. What is new: the
 * role on every tile, since it decides what the next page lets them do.
 */
export const meta: ScreenMeta = { title: 'Accounts, guest', order: 21, frame: 'none' };

/** The role a guest holds on an account, wherever that account is named. */
export function RoleBadge({ role }: { role: GrantRole }) {
  const Icon = role === 'edit' ? Pencil : Eye;
  return (
    <Badge variant={role === 'edit' ? 'secondary' : 'outline'}>
      <Icon aria-hidden />
      {ROLE_LABEL[role]}
    </Badge>
  );
}

function Tile({ shared }: { shared: SharedAccount }) {
  const account = asGuestSees(shared.account);
  const note = guestLedgerNote(account);
  return (
    <a
      href={`#/accounts/${account.id}`}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card className="h-full gap-4 px-4 py-4 transition-colors hover:border-primary hover:bg-muted/50">
        <span className="flex items-start gap-3">
          <AccountAvatar account={account} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{account.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {ACCOUNT_KINDS[account.kind].label}
            </span>
          </span>
          <RoleBadge role={shared.role} />
        </span>
        <span className="block">
          <span className={cn('block text-2xl font-semibold tabular-nums', balanceTone(account))}>
            {formatBalance(account.balance, account.currency)}
          </span>
          {note !== '' && <span className="block text-xs text-muted-foreground">{note}</span>}
        </span>
      </Card>
    </a>
  );
}

type Load = 'ready' | 'loading' | 'error';

function Body({ shared, load }: { shared: SharedAccount[]; load: Load }) {
  if (load === 'loading') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (load === 'error') {
    return (
      <EmptyState
        className="m-auto"
        icon={TriangleAlert}
        title="Could not load your accounts"
        description="Finance did not answer. Nothing was changed."
        action={<Button variant="outline">Try again</Button>}
      />
    );
  }
  if (shared.length === 0) {
    return (
      <EmptyState
        className="m-auto"
        icon={Users}
        title="Nothing is shared with you yet"
        description={`When ${OPERATOR_EMAIL} shares an account with ${GUEST_EMAIL}, it appears here.`}
      />
    );
  }
  return (
    <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
      {shared.map((item) => (
        <Tile key={item.account.id} shared={item} />
      ))}
    </div>
  );
}

function count(shared: SharedAccount[]): string {
  if (shared.length === 0) return `Shared by ${OPERATOR_EMAIL}`;
  const noun = shared.length === 1 ? 'account' : 'accounts';
  return `${shared.length} ${noun} shared by ${OPERATOR_EMAIL}`;
}

/** The guest's accounts page inside the guest chrome. */
export function GuestAccountsPage({
  shared,
  load = 'ready',
}: {
  shared: SharedAccount[];
  load?: Load;
}) {
  return (
    <GuestChrome active="accounts">
      <PageHeader title="Accounts" description={load === 'ready' ? count(shared) : undefined} />
      <Body shared={shared} load={load} />
    </GuestChrome>
  );
}

export const states: ScreenStates = {
  single: () => <GuestAccountsPage shared={sharedAccounts.slice(0, 1)} />,
  'view-only': () => (
    <GuestAccountsPage shared={sharedAccounts.map((item) => ({ ...item, role: 'view' }))} />
  ),
  empty: () => <GuestAccountsPage shared={[]} />,
  loading: () => <GuestAccountsPage shared={[]} load="loading" />,
  error: () => <GuestAccountsPage shared={[]} load="error" />,
};

export default function GuestAccountsScreen() {
  return <GuestAccountsPage shared={sharedAccounts} />;
}
