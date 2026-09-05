import { insightsByAccountId } from '@/fixtures/account-insights';
import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { accounts } from '@/fixtures/accounts';
import { checkpointsFor } from '@/fixtures/checkpoints';
import { formatBalance } from '@/fixtures/currencies';
import {
  asOfLine,
  balanceCaption,
  ModuleGrid,
  RecentTransactions,
  trendLine,
} from '@/kit/account-dashboard';
import { DashboardHeader } from '@/kit/account-dashboard-header';
import { AddCheckpointDialog } from '@/kit/checkpoint-form';
import { CheckpointHistory } from '@/kit/checkpoint-history';
import { CheckpointInconsistencyBadge } from '@/kit/checkpoint-inconsistency-badge';
import { balanceTone } from '@/kit/ledger-tone';
import { Sparkline } from '@/kit/sparkline';
import { Archive, Plus } from 'lucide-react';

import { Button, Card, CardContent, EmptyState, cn } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { AccountInsight } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account', order: 6, frame: 'web' };

/**
 * The balance card doubles as the checkpoint surface: the provenance line
 * that already says how current the number is opens into the same account's
 * checkpoint history, with adding a new one right where the question "how do
 * I know this is right" comes up. A card that must be searched for elsewhere
 * on the page would answer a question nobody was asking there yet.
 */
function BalanceCard({ account, insight }: { account: Account; insight?: AccountInsight }) {
  const history = insight?.history ?? [];
  const tone = balanceTone(account);
  const checkpointable = ACCOUNT_KINDS[account.kind].checkpointable;
  const checkpoints = checkpointsFor(account.id);
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
          </p>
        </div>
        {history.length > 1 && (
          <div className="space-y-1">
            <Sparkline points={history} className={tone} />
            <p className="text-xs text-muted-foreground">{trendLine(account, history)}</p>
          </div>
        )}
      </CardContent>
      {checkpointable && (
        <CardContent className="border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Checkpoints
            </h3>
            <Button variant="ghost" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Add checkpoint
            </Button>
          </div>
          {checkpoints.length > 0 ? (
            <CheckpointHistory account={account} />
          ) : (
            <p className="text-xs text-muted-foreground">
              No checkpoints yet — add one when you&apos;ve confirmed this balance against the bank.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AccountDashboard({ account }: { account: Account }) {
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

const byId = new Map(accounts.map((a) => [a.id, a]));

const detail = (id: string) => () => {
  const account = byId.get(id);
  return account ? <AccountDashboard account={account} /> : <EmptyState title="No such account" />;
};

function addCheckpointState() {
  const account = byId.get('a1');
  if (!account) return <EmptyState title="No such account" />;
  return (
    <>
      <AccountDashboard account={account} />
      <AddCheckpointDialog account={account} />
    </>
  );
}

export const states: ScreenStates = {
  checking: detail('a1'),
  savings: detail('a4'),
  'credit-card': detail('a2'),
  cash: detail('a5'),
  'gift-card': detail('a6'),
  person: detail('a7'),
  points: detail('a9'),
  loan: detail('a11'),
  archived: detail('a10'),
  inconsistent: detail('a2'),
  'add-checkpoint': addCheckpointState,
};

export default detail('a1');
