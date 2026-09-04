import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account, activeAccounts, accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { initials, institutionsById } from '@/fixtures/institutions';

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

const AVATAR_SIZE = {
  sm: 'h-5 w-5 rounded text-[9px]',
  md: 'h-9 w-9 rounded-md text-xs',
} as const;

/**
 * The mark that identifies an account: its institution's logo when one has
 * been uploaded, the institution's initials on its brand colour when not, and
 * the kind icon for the accounts that belong to no institution at all — cash
 * in a drawer has no bank to show.
 */
export function AccountAvatar({
  account,
  size = 'sm',
}: {
  account: Account;
  size?: keyof typeof AVATAR_SIZE;
}) {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)
    : undefined;
  const shape = cn('flex shrink-0 items-center justify-center overflow-hidden', AVATAR_SIZE[size]);
  if (institution?.logo) {
    return <img src={institution.logo} alt="" className={shape} />;
  }
  if (institution) {
    return (
      <span
        className={cn(shape, 'font-semibold text-white')}
        style={{ backgroundColor: institution.colour }}
        aria-hidden
      >
        {initials(institution.name)}
      </span>
    );
  }
  const Icon = ACCOUNT_KINDS[account.kind].icon;
  return (
    <span className={cn(shape, 'bg-muted')} aria-hidden>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4.5 w-4.5'} />
    </span>
  );
}

/**
 * An account wherever one is named. `compact` fits a table cell, `inline` sits
 * in a sentence and carries its own background, `full` heads a card.
 */
export function AccountChip({
  account,
  size = 'compact',
}: {
  account: Account;
  size?: 'compact' | 'inline' | 'full';
}) {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)
    : undefined;
  if (size === 'full') {
    return (
      <span className={cn('inline-flex items-center gap-3', account.archived && 'opacity-60')}>
        <AccountAvatar account={account} size="md" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{account.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{account.currency}</span>
            {account.archived && (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {institution?.name ?? ACCOUNT_KINDS[account.kind].label}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 align-middle text-sm',
        size === 'inline' && 'rounded-full bg-muted px-2 py-0.5',
        account.archived && 'opacity-60'
      )}
    >
      <AccountAvatar account={account} />
      <span className="truncate">{account.name}</span>
      {account.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
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
      <Section title="Compact · transaction table">
        <TableSpecimen accounts={accounts} />
      </Section>
      <Section title="Full · card header">
        <div className="flex flex-wrap gap-4">
          {accounts.slice(0, 2).map((account) => (
            <CardSpecimen key={account.id} account={account} />
          ))}
        </div>
      </Section>
      {accounts[0] && (
        <Section title="Inline · rule preview and context panel">
          <p className="max-w-prose text-sm leading-7">
            Corrections scoped to <AccountChip account={accounts[0]} size="inline" /> will apply to
            41 of the 60 matched transactions, and none of the{' '}
            <AccountChip account={accounts[1] ?? accounts[0]} size="inline" /> ones.
          </p>
        </Section>
      )}
    </div>
  );
}

export const states: ScreenStates = {
  archived: () => <AccountChipSpecimen accounts={allAccounts.filter((a) => a.archived)} />,
  'no-logo': () => (
    <AccountChipSpecimen accounts={activeAccounts.filter((a) => a.institutionId !== 'anz')} />
  ),
  'long-names': () => (
    <AccountChipSpecimen
      accounts={activeAccounts
        .slice(0, 3)
        .map((a) => ({ ...a, name: `${a.name} — joint offset transaction account` }))}
    />
  ),
};

export default function AccountChipScreen() {
  return <AccountChipSpecimen accounts={activeAccounts.slice(0, 6)} />;
}
