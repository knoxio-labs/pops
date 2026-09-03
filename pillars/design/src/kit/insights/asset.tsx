import { formatBalance } from '@/fixtures/currencies';
import { ProgressBar } from '@/kit/sparkline';

import { Badge, Button } from '@pops/ui';

import { Empty, Stat } from './atoms';

import type { BalancePoint } from '@/fixtures/account-insights';

import type { InsightModules } from './contract';

function monthLabel(month: string, ahead = 0): string {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + ahead, 1);
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function periodChange(history: BalancePoint[]): { change: number; word: string } {
  const change = (history.at(-1)?.balance ?? 0) - (history.at(0)?.balance ?? 0);
  if (change === 0) return { change, word: 'unchanged' };
  return { change, word: change > 0 ? 'up' : 'down' };
}

/**
 * Months until `goal` is reached, compounding monthly: each month the balance
 * earns `annualRatePct / 12` and then the contribution lands. Null when the
 * goal is not reached inside 50 years, which is the honest answer to a plan
 * that does not converge. A projection, not a schedule: it assumes the
 * contribution never changes and the rate never moves.
 */
function monthsToGoal(
  start: number,
  goal: number,
  monthlyContribution: number,
  annualRatePct: number
): number | null {
  if (start >= goal) return 0;
  const rate = annualRatePct / 100 / 12;
  let balance = start;
  for (let month = 1; month <= 600; month += 1) {
    const next = balance * (1 + rate) + monthlyContribution;
    if (next <= balance) return null;
    balance = next;
    if (balance >= goal) return month;
  }
  return null;
}

function forecastLine(months: number | null, from: string | undefined): string {
  if (months === 0) return 'already there';
  if (months === null) return 'never at this contribution';
  if (from === undefined) return 'no history to date it from';
  return monthLabel(from, months);
}

export const assetModules: InsightModules = {
  savings: [
    {
      id: 'savings-goal',
      title: 'Goal',
      span: 2,
      Body: ({ account, insight }) => {
        const plan = insight.savings;
        if (!plan) return <Empty>No goal set on this account.</Empty>;
        const { goal, monthlyContribution: monthly, annualRatePct: rate } = plan;
        const from = insight.history.at(-1)?.month;
        const withInterest = monthsToGoal(account.balance, goal, monthly, rate);
        const alone = monthsToGoal(account.balance, goal, monthly, 0);
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{plan.goalName}</span>
              <Badge variant="secondary">{rate}% p.a.</Badge>
            </div>
            <ProgressBar fraction={account.balance / goal} />
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Saved"
                value={formatBalance(account.balance, account.currency)}
                hint={`of ${formatBalance(goal, account.currency)}`}
              />
              <Stat
                label="Still to find"
                value={formatBalance(Math.max(goal - account.balance, 0), account.currency)}
                hint={`${formatBalance(monthly, account.currency)} a month`}
              />
            </div>
            <p className="text-sm">
              Projected to reach it{' '}
              <span className="font-medium">{forecastLine(withInterest, from)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Contributions alone: {forecastLine(alone, from)}. Assumes both rate and contribution
              hold.
            </p>
          </div>
        );
      },
    },
  ],
  checking: [
    {
      id: 'checking-flow',
      title: 'Month on month',
      Body: ({ account, insight }) => {
        const [last, prior] = [insight.history.at(-1), insight.history.at(-2)];
        if (!last || !prior) return <Empty>Not enough history yet.</Empty>;
        const net = last.balance - prior.balance;
        const history = insight.history;
        const average = periodChange(history).change / (history.length - 1);
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label={`Net in ${monthLabel(last.month)}`}
                value={formatBalance(net, account.currency)}
              />
              <Stat
                label="Average month"
                value={formatBalance(Math.round(average), account.currency)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Derived from closing balances, not from transactions: money in and out are not counted
              separately.
            </p>
          </div>
        );
      },
    },
    {
      id: 'checking-floor',
      title: 'Lowest balance',
      Body: ({ account, insight }) => {
        const floor = insight.history.toSorted((a, b) => a.balance - b.balance)[0];
        if (!floor || insight.history.length < 2) return <Empty>Not enough history yet.</Empty>;
        return (
          <Stat
            label="Lowest it went"
            value={formatBalance(floor.balance, account.currency)}
            hint={monthLabel(floor.month)}
          />
        );
      },
    },
  ],
  cash: [
    {
      id: 'cash-count',
      title: 'Counted by you',
      span: 2,
      Body: ({ account, insight }) => {
        const history = insight.history;
        const first = history.length > 1 ? history[0] : undefined;
        const drift = first ? periodChange(history).change : null;
        const on = account.balanceAsOf;
        const countedOn = on
          ? new Date(on).toLocaleDateString('en-AU', { dateStyle: 'medium' })
          : 'Never';
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No bank confirms this one. It is right as far as your last count and no further.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Last counted" value={countedOn} />
              <Stat
                label="Moved"
                value={drift === null ? '—' : formatBalance(drift, account.currency)}
                hint={first ? `since ${monthLabel(first.month)}` : undefined}
              />
            </div>
            <Button size="sm" variant="outline">
              Count it now
            </Button>
          </div>
        );
      },
    },
  ],
};
