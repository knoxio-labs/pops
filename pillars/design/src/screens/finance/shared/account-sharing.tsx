import { accounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import {
  type AccountGrant,
  type GrantRole,
  grants as allGrants,
  ledgerEntries,
  personLedger,
  ROLE_OPTIONS,
} from '@/fixtures/sharing';
import { balanceCaption, day } from '@/kit/account-dashboard';
import { DashboardHeader } from '@/kit/account-dashboard-header';
import { balanceTone, ledgerTone } from '@/kit/ledger-tone';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Select,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TextInput,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';
import type { ReactNode } from 'react';

/**
 * Account detail for the operator, with Sharing beside the transactions. It
 * is on every kind of account, and a guest never sees it. A person is named
 * by the exact email they sign in with, since that is all a grant is.
 *
 * Adding an email that already has access changes its role in place rather
 * than adding a second row. A malformed email shows the server's own message.
 */
export const meta: ScreenMeta = { title: 'Sharing, operator', order: 20, frame: 'web' };

/** The shared Select fills its row, so the role picker is held to a width by its wrapper. */
const RoleSelect = ({ label, role }: { label: string; role: GrantRole }) => (
  <span className="w-32 shrink-0">
    <Select aria-label={label} options={ROLE_OPTIONS} defaultValue={role} />
  </span>
);

function GrantRow({ grant }: { grant: AccountGrant }) {
  return (
    <li className="space-y-1 border-b border-border py-2 last:border-b-0">
      <span className="block truncate text-sm">{grant.email}</span>
      <span className="flex items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground">Added {day(grant.addedOn)}</span>
        <RoleSelect label={`Role for ${grant.email}`} role={grant.role} />
        <Button variant="ghost" size="sm" className="text-destructive">
          Revoke
        </Button>
      </span>
    </li>
  );
}

export interface SharingProps {
  grants: AccountGrant[];
  load?: 'ready' | 'loading' | 'error';
  /** What is in the email box, kept when a save is refused. */
  draft?: string;
  /** The server's answer to the last save, shown under the form. */
  problem?: string;
  /** A quiet confirmation of the last change. */
  notice?: string;
}

function People({ grants, load = 'ready' }: SharingProps) {
  if (load === 'loading') {
    return <Skeleton className="h-20" role="status" aria-label="Loading" />;
  }
  if (load === 'error') {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load who this is shared with.
        <Button variant="link" size="sm">
          Try again
        </Button>
      </p>
    );
  }
  if (grants.length === 0) {
    return <p className="text-sm text-muted-foreground">Only you can open this account.</p>;
  }
  return (
    <ul aria-label="People with access">
      {grants.map((grant) => (
        <GrantRow key={grant.email} grant={grant} />
      ))}
    </ul>
  );
}

/** Who an account is shared with: list, add by email, change role, revoke. */
export function SharingSection(props: SharingProps) {
  const { draft = '', problem, notice, load = 'ready' } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Sharing</CardTitle>
        <CardDescription>
          People sign in with the email you add, and see this account and nothing else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <People {...props} />
        {load === 'ready' && (
          <div className="flex flex-wrap items-start gap-2">
            <TextInput
              aria-label="Email to share with"
              type="email"
              placeholder="name@example.com"
              defaultValue={draft}
              error={problem}
              containerClassName="min-w-40 flex-1"
            />
            <RoleSelect label="Role" role="view" />
            <Button>Share</Button>
          </div>
        )}
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </CardContent>
    </Card>
  );
}

function RecentEntries({ account }: { account: Account }) {
  const entries = ledgerEntries.filter((entry) => entry.accountId === account.id);
  return (
    <ul className="min-h-0 overflow-y-auto" aria-label="Recent transactions">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex gap-3 border-b border-border py-2 text-sm last:border-b-0"
        >
          <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
            {day(entry.date)}
          </span>
          <span className="min-w-0 flex-1 truncate">{entry.description}</span>
          <span className={cn('tabular-nums', ledgerTone(entry.amount))}>
            {formatBalance(entry.amount, account.currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The operator's account page: header, balance, then transactions and
 * activity on tabs with Sharing beside them. `panel` replaces the tab's body,
 * so the activity screen can stage its list here.
 */
export function OperatorAccountPage({
  account,
  sharing,
  tab = 'transactions',
  panel,
}: {
  account: Account;
  sharing: SharingProps;
  tab?: 'transactions' | 'activity';
  panel?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <DashboardHeader account={account} />
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className={cn('text-3xl font-semibold tabular-nums', balanceTone(account))}>
          {formatBalance(account.balance, account.currency)}
        </span>
        <span className="text-sm text-muted-foreground">{balanceCaption(account)}</span>
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="order-last flex max-h-96 flex-col gap-2 lg:order-none">
          <Tabs value={tab}>
            <TabsList>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </Tabs>
          {panel ?? <RecentEntries account={account} />}
        </section>
        <SharingSection {...sharing} />
      </div>
    </div>
  );
}

const page = (sharing: SharingProps, account: Account = personLedger) =>
  function SharingState() {
    return <OperatorAccountPage account={account} sharing={sharing} />;
  };

const everyday = accounts.find((account) => account.id === 'a1') ?? personLedger;

export const states: ScreenStates = {
  'not-shared': page({ grants: [] }),
  'another-kind': page({ grants: allGrants.slice(1) }, everyday),
  'invalid-email': page({
    grants: allGrants,
    draft: 'marta@ferreira',
    problem: 'Enter a full email address, such as name@example.com.',
  }),
  'role-changed': page({
    grants: allGrants.map((grant) => ({ ...grant, role: 'view' })),
    notice: 'marta@ferreira.example already had access. Their role is now Can view.',
  }),
  revoked: page({
    grants: allGrants.slice(0, 1),
    notice: 'dana@whitlock.example can no longer open this account.',
  }),
  'save-failed': page({
    grants: allGrants,
    draft: 'noor@halabi.example',
    problem: 'Could not share the account. Finance did not answer; nothing changed.',
  }),
  loading: page({ grants: [], load: 'loading' }),
  error: page({ grants: [], load: 'error' }),
};

export default page({ grants: allGrants });
