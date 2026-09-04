import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account chip', order: 4, frame: 'web' };

/** Two letters of the institution, or of the account name when it has none. */
function institutionName(account: Account): string | undefined {
  return account.institutionId ? institutionsById.get(account.institutionId)?.name : undefined;
}

function monogram(account: Account): string {
  return (institutionName(account) ?? account.name).slice(0, 2).toUpperCase();
}

/**
 * The account chip, institution-led: the bank is the first thing read and the
 * account name qualifies it, on the bet that a statement is remembered as
 * "the ANZ one" before it is remembered as "a credit card".
 */
export function AccountChip({
  account,
  size = 'compact',
}: {
  account: Account;
  size?: 'compact' | 'full';
}) {
  const kind = ACCOUNT_KINDS[account.kind];
  const Icon = kind.icon;
  if (size === 'compact') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-sm', account.archived && 'opacity-60')}
      >
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {monogram(account)}
        </span>
        <span className="truncate">{account.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {account.currency}
        </span>
        {account.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-3', account.archived && 'opacity-60')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
        {monogram(account)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {institutionName(account) ?? 'No institution'}
          </span>
          {account.archived && (
            <Badge variant="outline" className="text-xs">
              Archived
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{account.name}</span>
          <span className="tabular-nums">· {account.currency}</span>
        </span>
      </span>
    </span>
  );
}

function TableSpecimen({ accounts }: { accounts: Account[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account, index) => (
          <TableRow key={account.id}>
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              2026-08-2{index}
            </TableCell>
            <TableCell className="text-sm">WOOLWORTHS 1234 NEWTOWN</TableCell>
            <TableCell>
              <AccountChip account={account} />
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums">
              {formatBalance(-8_432, account.currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CardSpecimen({ account }: { account: Account }) {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>
          <AccountChip account={account} size="full" />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The card header is where an account has room to say which one it is.
      </CardContent>
    </Card>
  );
}

/** Every context the chip has to survive, on one page, on the same accounts. */
export function AccountChipSpecimen({ accounts }: { accounts: Account[] }) {
  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Account chip"
        description="One account, rendered wherever an account is shown."
      />
      <section className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Compact · transaction table
        </h2>
        <TableSpecimen accounts={accounts} />
      </section>
      <section className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Full · card header
        </h2>
        <div className="flex flex-wrap gap-4">
          {accounts.slice(0, 2).map((account) => (
            <CardSpecimen key={account.id} account={account} />
          ))}
        </div>
      </section>
      {accounts[0] && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Inline · rule preview and context panel
          </h2>
          <p className="max-w-prose text-sm">
            Corrections scoped to <AccountChip account={accounts[0]} /> will apply to 41 of the 60
            matched transactions.
          </p>
        </section>
      )}
    </div>
  );
}

const active = allAccounts.filter((a) => !a.archived);

export const states: ScreenStates = {
  archived: () => <AccountChipSpecimen accounts={allAccounts.filter((a) => a.archived)} />,
  'one-account': () => <AccountChipSpecimen accounts={active.slice(0, 1)} />,
  'long-names': () => (
    <AccountChipSpecimen
      accounts={active
        .slice(0, 3)
        .map((a) => ({ ...a, name: `${a.name} — joint offset transaction account` }))}
    />
  ),
};

export default function AccountChipScreen() {
  return <AccountChipSpecimen accounts={active.slice(0, 5)} />;
}
