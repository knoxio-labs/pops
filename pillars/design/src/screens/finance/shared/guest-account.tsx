import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { formatBalance } from '@/fixtures/currencies';
import {
  actorLabel,
  asGuestSees,
  GUEST_EMAIL,
  guestAmount,
  guestEntryNote,
  guestLedgerNote,
  type LedgerEntry,
  ledgerEntries,
  OPERATOR_EMAIL,
  personLedger,
  type SharedAccount,
  sharedAccounts,
} from '@/fixtures/sharing';
import { day } from '@/kit/account-dashboard';
import { balanceTone, ledgerTone } from '@/kit/ledger-tone';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { RoleBadge } from '@/screens/finance/shared/guest-accounts';
import { GuestChrome } from '@/screens/shell/guest-shell';
import { Paperclip, Plus, ReceiptText, SearchX, TriangleAlert } from 'lucide-react';

import {
  Button,
  cn,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';
import type { ReactNode } from 'react';

/**
 * Account detail as a guest opens it. Gone: Import, Edit account, Archive,
 * Settle up, the checkpoints link, the balance history and the kind's insight
 * cards. Kept: the balance, the entries, and Add transaction when the role is
 * `edit`. The role sits in the header because it explains every missing button.
 *
 * A person ledger is worded from the guest's side: it is "Your ledger", a
 * negative balance is what they owe, and each entry says who paid for whom.
 */
export const meta: ScreenMeta = { title: 'Account, guest', order: 22, frame: 'none' };

const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  purchase: 'Purchase',
  refund: 'Refund',
  transfer: 'Transfer',
};

function EntryRow({ entry, account }: { entry: LedgerEntry; account: Account }) {
  const amount = guestAmount(entry, account);
  const what = account.kind === 'person' ? guestEntryNote(entry) : TYPE_LABEL[entry.type];
  return (
    <li className="flex items-center gap-3 border-b border-border px-1 py-2.5 last:border-b-0">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        {day(entry.date)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{entry.description}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {what}
          <span className="hidden sm:inline">
            {' · '}added by {actorLabel(entry.byEmail, GUEST_EMAIL).toLowerCase()}
          </span>
        </span>
      </span>
      {entry.files > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" aria-hidden />
          <span aria-label={`${entry.files} files attached`}>{entry.files}</span>
        </span>
      )}
      <span className={cn('w-24 shrink-0 text-right text-sm tabular-nums', ledgerTone(amount))}>
        {amount > 0 ? '+' : ''}
        {formatBalance(amount, account.currency)}
      </span>
    </li>
  );
}

/** The entries of one shared account, as the guest reads them. The list scrolls; the page does not. */
export function EntryList({ entries, account }: { entries: LedgerEntry[]; account: Account }) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Transactions">
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} account={account} />
      ))}
    </ul>
  );
}

function BalanceLine({ account }: { account: Account }) {
  const caption = guestLedgerNote(account) || `${ACCOUNT_KINDS[account.kind].label} balance`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-4">
      <span className={cn('text-4xl font-semibold tabular-nums', balanceTone(account))}>
        {formatBalance(account.balance, account.currency)}
      </span>
      <span className="text-sm text-muted-foreground">{caption}</span>
    </div>
  );
}

export type GuestAccountTab = 'transactions' | 'activity';

/**
 * The guest's account page. `children` is the panel under the tabs, so the
 * activity screen can stage its own list in the same page.
 */
export function GuestAccountPage({
  shared,
  tab = 'transactions',
  children,
}: {
  shared: SharedAccount;
  tab?: GuestAccountTab;
  children: ReactNode;
}) {
  const account = asGuestSees(shared.account);
  const canEdit = shared.role === 'edit';
  return (
    <GuestChrome active="accounts">
      <PageHeader
        title={account.name}
        icon={<AccountAvatar account={account} size="md" />}
        description={`${ACCOUNT_KINDS[account.kind].label} · shared by ${OPERATOR_EMAIL}`}
        backHref="#/accounts"
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={shared.role} />
            {canEdit && (
              <Button size="sm" prefix={<Plus className="h-4 w-4" />}>
                Add transaction
              </Button>
            )}
          </span>
        }
      />
      <BalanceLine account={account} />
      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>
      {children}
    </GuestChrome>
  );
}

const entriesFor = (accountId: string) =>
  ledgerEntries.filter((entry) => entry.accountId === accountId);

const [ledgerShare, walletShare] = sharedAccounts;
const withBalance = (balance: number): SharedAccount => ({
  account: { ...personLedger, balance },
  role: 'edit',
});

function Ledger({ shared }: { shared: SharedAccount }) {
  return (
    <GuestAccountPage shared={shared}>
      <EntryList entries={entriesFor(shared.account.id)} account={shared.account} />
    </GuestAccountPage>
  );
}

function Unavailable({ icon, title, body }: { icon: typeof SearchX; title: string; body: string }) {
  return (
    <GuestChrome active="accounts">
      <EmptyState
        className="m-auto"
        icon={icon}
        title={title}
        description={body}
        action={<Button variant="outline">Back to accounts</Button>}
      />
    </GuestChrome>
  );
}

export const states: ScreenStates = {
  view: () => <Ledger shared={{ account: personLedger, role: 'view' }} />,
  owed: () => <Ledger shared={withBalance(-6_400)} />,
  settled: () => <Ledger shared={withBalance(0)} />,
  'not-a-person': () => (walletShare ? <Ledger shared={walletShare} /> : null),
  empty: () => (
    <GuestAccountPage shared={withBalance(0)}>
      <EmptyState
        className="m-auto"
        icon={ReceiptText}
        title="No transactions yet"
        description="Add the first one, with a photo of the receipt if you have it."
      />
    </GuestAccountPage>
  ),
  loading: () => (
    <GuestChrome active="accounts">
      <div className="space-y-4" role="status" aria-label="Loading">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-48" />
      </div>
    </GuestChrome>
  ),
  error: () => (
    <Unavailable
      icon={TriangleAlert}
      title="Could not load this account"
      body="Finance did not answer. Nothing was changed."
    />
  ),
  'no-longer-shared': () => (
    <Unavailable
      icon={SearchX}
      title="This account is not available"
      body="It may have been removed, or it is no longer shared with you."
    />
  ),
};

export default function GuestAccountScreen() {
  return ledgerShare ? <Ledger shared={ledgerShare} /> : null;
}
