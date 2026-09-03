import { insightsByAccountId } from '@/fixtures/account-insights';
import { ACCOUNT_KINDS, sideNoun } from '@/fixtures/account-kinds';
import { type Account } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { importRows } from '@/fixtures/import-review';
import { institutionsById } from '@/fixtures/institutions';
import { modulesFor } from '@/kit/insights';
import { Sparkline } from '@/kit/sparkline';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Archive, FileUp, HandCoins, Pencil, Plus } from 'lucide-react';

import {
  Badge,
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

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/**
 * The sentence over the headline number. A liability's positive balance is
 * money owed and a person ledger's sign says which way the debt runs, so the
 * number is never shown without the reading that makes it mean something.
 */
function balanceCaption(account: Account): string {
  const kind = ACCOUNT_KINDS[account.kind];
  const who = account.contact ?? account.name;
  if (account.kind === 'person') return account.balance >= 0 ? `${who} owes you` : `You owe ${who}`;
  if (kind.storedValue) return 'Remaining stored value';
  if (kind.side === 'liability') return 'Owed on this account';
  return `Balance ${sideNoun(kind.side)}`;
}

function asOfLine(account: Account): string {
  if (account.balanceAsOf) return `As of ${day(account.balanceAsOf)}`;
  if (!ACCOUNT_KINDS[account.kind].checkpointable) {
    return 'No external balance to check against — derived from transactions';
  }
  return 'Derived from transactions; never checked against a statement';
}

/**
 * A rising line means opposite things on the two sides of the ledger: savings
 * growing is good news and a loan growing is not, so the tone follows the
 * direction the balance moved read against the account's own side. A person
 * ledger has no favourable direction and stays neutral.
 */
function trend(account: Account, history: BalancePoint[]) {
  const side = ACCOUNT_KINDS[account.kind].side;
  const change = (history.at(-1)?.balance ?? 0) - (history.at(0)?.balance ?? 0);
  const direction = change >= 0 ? 'Up' : 'Down';
  const line = `${direction} ${formatBalance(Math.abs(change), account.currency)} over 12 months`;
  if (side === 'either' || change === 0) return { tone: 'text-muted-foreground', line };
  const favourable = side === 'liability' ? change < 0 : change > 0;
  return { tone: favourable ? 'text-primary' : 'text-destructive', line };
}

function DashboardHeader({ account }: { account: Account }) {
  const where = institutionsById.get(account.institutionId ?? '')?.name ?? 'No institution';
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className={cn('flex items-center gap-3', account.archived && 'opacity-70')}>
        <AccountAvatar account={account} size="md" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{account.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{where}</span>
            <Badge variant="secondary">{ACCOUNT_KINDS[account.kind].label}</Badge>
            <Badge variant="outline">{account.currency}</Badge>
            {account.archived && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a href={`#/imports/new?account=${account.id}`}>
            <FileUp className="h-4 w-4" />
            Import transactions
          </a>
        </Button>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add transaction
        </Button>
        {account.kind === 'person' && (
          <Button variant="outline" size="sm">
            <HandCoins className="h-4 w-4" />
            Settle up
          </Button>
        )}
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
          Edit account
        </Button>
      </div>
    </div>
  );
}

function BalanceCard({ account, insight }: { account: Account; insight?: AccountInsight }) {
  const shown = account.kind === 'person' ? Math.abs(account.balance) : account.balance;
  const history = insight?.history ?? [];
  const { tone, line } = trend(account, history);
  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {balanceCaption(account)}
          </p>
          <p className="text-4xl font-semibold tabular-nums">
            {formatBalance(shown, account.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {asOfLine(account)} · {account.transactionCount.toLocaleString('en-AU')} transactions
          </p>
        </div>
        {history.length > 1 && (
          <div className="space-y-1">
            <Sparkline points={history} className={tone} />
            <p className="text-xs text-muted-foreground">{line}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleGrid({ account, insight }: { account: Account; insight?: AccountInsight }) {
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

function RecentTransactions({ account }: { account: Account }) {
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
          Archived. Its transactions still count; it is hidden from pickers and totals.
        </div>
      )}
      <DashboardHeader account={account} />
      <BalanceCard account={account} insight={insight} />
      <ModuleGrid account={account} insight={insight} />
      <RecentTransactions account={account} />
    </div>
  );
}
