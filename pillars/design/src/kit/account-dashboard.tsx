import { insightsByAccountId } from '@/fixtures/account-insights';
import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account } from '@/fixtures/accounts';
import { balanceAsOf } from '@/fixtures/checkpoints';
import { formatBalance } from '@/fixtures/currencies';
import { importRows } from '@/fixtures/import-review';
import { DashboardHeader } from '@/kit/account-dashboard-header';
import { CheckpointInconsistencyBadge } from '@/kit/checkpoint-inconsistency-badge';
import { ImportFedByLine } from '@/kit/import-fed-by-line';
import { modulesFor } from '@/kit/insights';
import { balanceTone } from '@/kit/ledger-tone';
import { Sparkline } from '@/kit/sparkline';
import { Archive } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import type { AccountInsight, BalancePoint } from '@/fixtures/account-insights';
import type { ImportRow } from '@/fixtures/import-review';

const signed = (row: ImportRow) => (row.type === 'debit' ? -row.amountCents : row.amountCents);

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/**
 * The line over the headline number. It names what the account is, not what
 * its sign means — the number carries that itself. The person ledger is the
 * exception: a minus sign cannot say who is owed, so that one keeps a sentence
 * naming the contact.
 */
export function balanceCaption(account: Account): string {
  const kind = ACCOUNT_KINDS[account.kind];
  const who = account.contact ?? account.name;
  if (account.kind === 'person') {
    if (account.balance === 0) return `Settled up with ${who}`;
    return account.balance > 0 ? `${who} owes you` : `You owe ${who}`;
  }
  if (kind.storedValue) return 'Remaining stored value';
  return `${kind.label} balance`;
}

/**
 * Every kind can take a checkpoint; what differs is who supplied the number.
 * A bank or a card issuer publishes a balance to check against, a wallet or
 * a person ledger only has what you counted — so the wording follows
 * `checkpointable`, and the feature does not.
 */
export function asOfLine(account: Account): string {
  const asOf = balanceAsOf(account);
  if (asOf) return `As of ${day(asOf)}`;
  return ACCOUNT_KINDS[account.kind].checkpointable
    ? 'Derived from transactions; never checked against the bank'
    : 'Derived from transactions; never counted';
}

/**
 * Where the balance has travelled over the series, said plainly. The sparkline
 * it captions is drawn in the balance's own tone, so a loan climbing toward
 * zero stays red — it is a negative number getting less negative, and it is
 * still debt.
 */
export function trendLine(account: Account, history: BalancePoint[]): string {
  const change = (history.at(-1)?.balance ?? 0) - (history.at(0)?.balance ?? 0);
  const direction = change >= 0 ? 'Up' : 'Down';
  return `${direction} ${formatBalance(Math.abs(change), account.currency)} over 12 months`;
}

function BalanceCard({ account, insight }: { account: Account; insight?: AccountInsight }) {
  const history = insight?.history ?? [];
  const tone = balanceTone(account);
  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {balanceCaption(account)}
            </p>
            <CheckpointInconsistencyBadge account={account} />
          </div>
          <p className={cn('text-4xl font-semibold tabular-nums', tone)}>
            {formatBalance(account.balance, account.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {asOfLine(account)} · {account.transactionCount.toLocaleString('en-AU')} transactions
            {' · '}
            <a
              href={`#/accounts/${account.id}/checkpoints`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Checkpoints
            </a>
          </p>
          <ImportFedByLine account={account} />
        </div>
        {history.length > 1 && (
          <div className="space-y-1">
            <Sparkline points={history} className={tone} />
            <p className="text-xs text-muted-foreground">{trendLine(account, history)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ModuleGrid({ account, insight }: { account: Account; insight?: AccountInsight }) {
  const modules = modulesFor(account.kind);
  if (!insight || modules.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((module) => (
        <Card key={module.id} className={module.span === 2 ? 'sm:col-span-2' : undefined}>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{module.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <module.Body account={account} insight={insight} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RecentTransactions({ account }: { account: Account }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent transactions
        </h2>
        <Button variant="link" size="sm" asChild>
          <a href={`#/transactions?account=${account.id}`}>View all</a>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {importRows.slice(0, 6).map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {day(row.date)}
              </TableCell>
              <TableCell className="text-sm">
                {row.description}
                {row.entity ? ` · ${row.entity}` : ''}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatBalance(signed(row), account.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * One account as a dashboard: the parts every account has — header, balance,
 * recent transactions — with the cards its kind earns dropped in between. A
 * kind nothing has been designed for shows the shell and no grid, which is
 * the honest outcome rather than an empty placeholder.
 */
export function AccountDashboard({ account }: { account: Account }) {
  const insight = insightsByAccountId[account.id];
  return (
    <div className="space-y-6 p-6">
      {account.archived && (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <Archive className="h-4 w-4" />
          Archived, not deleted — its transactions still reference it, so it stays out of pickers
          and totals until it is unarchived.
        </div>
      )}
      <DashboardHeader account={account} />
      <BalanceCard account={account} insight={insight} />
      <ModuleGrid account={account} insight={insight} />
      <RecentTransactions account={account} />
    </div>
  );
}
