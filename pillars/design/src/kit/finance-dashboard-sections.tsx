import { type Budget } from '@/fixtures/budgets';
import { type Transaction } from '@/fixtures/transactions';
import { Plus, Upload } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  formatCurrency,
  Progress,
  StatCard,
  type StatCardColor,
} from '@pops/ui';

/**
 * The finance dashboard's three sections as they ship
 * (`pillars/finance/app/src/pages/dashboard/`): the stat tiles, the recent
 * rows and the active budgets. A kit module so the dashboard screen and
 * every variant of it arrange the same sections and differ only in what
 * they add.
 */
const money = (value: number) =>
  formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function signedColor(amount: number): StatCardColor {
  if (amount > 0) return 'emerald';
  if (amount < 0) return 'rose';
  return 'slate';
}

/** Income and expenses for the tiles, both in minor units and both non-negative. */
export function monthTotals(transactions: Transaction[]): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.amountMinorUnits > 0) income += t.amountMinorUnits;
    else expenses -= t.amountMinorUnits;
  }
  return { income, expenses };
}

export function StatsGrid({ transactions }: { transactions: Transaction[] }) {
  const { income, expenses } = monthTotals(transactions);
  const net = (income - expenses) / 100;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total transactions"
        value={(1_284).toLocaleString()}
        description="All time"
        color="slate"
      />
      <StatCard
        title="Income"
        value={money(income / 100)}
        description="This month"
        color={signedColor(income)}
      />
      <StatCard
        title="Expenses"
        value={money(expenses / 100)}
        description="This month"
        color={signedColor(-expenses)}
      />
      <StatCard title="Net" value={money(net)} description="This month" color={signedColor(net)} />
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const negative = transaction.amountMinorUnits < 0;
  return (
    <div className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">{transaction.description}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(transaction.date).toLocaleDateString('en-AU')}</span>
          {transaction.entityName && (
            <>
              <span className="text-2xs text-muted-foreground/50">•</span>
              <span className="truncate">{transaction.entityName}</span>
            </>
          )}
        </div>
      </div>
      <p
        className={`text-lg font-bold tracking-tight tabular-nums ${negative ? 'text-destructive' : 'text-success'}`}
      >
        {negative ? '-' : '+'}
        {money(Math.abs(transaction.amountMinorUnits) / 100)}
      </p>
    </div>
  );
}

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <Card className="border-dashed p-12 text-center">
        <p className="mb-4 text-muted-foreground">No transactions yet.</p>
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" prefix={<Upload className="h-4 w-4" />}>
            Import
          </Button>
          <Button size="sm" variant="outline" prefix={<Plus className="h-4 w-4" />}>
            Add transaction
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-border">
        {transactions.map((t) => (
          <TransactionRow key={t.id} transaction={t} />
        ))}
      </div>
    </Card>
  );
}

function BudgetCard({ budget }: { budget: Budget }) {
  const pct = Math.round((budget.spent / budget.amount) * 100);
  const over = pct > 100;
  return (
    <Card className="flex h-full flex-col justify-between p-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
            {budget.category}
          </h3>
          <Badge variant="default" className="h-5 text-2xs">
            Active
          </Badge>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">${budget.amount.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">/ {budget.period}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge variant={over ? 'destructive' : 'default'} className="font-mono tabular-nums">
            ${budget.spent.toFixed(2)}
          </Badge>
          <div className="flex min-w-30 items-center gap-2">
            <Progress value={Math.min(pct, 100)} className="flex-1" />
            <span
              className={`w-12 text-right font-mono text-xs tabular-nums ${over ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {pct}%
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ActiveBudgets({ budgets }: { budgets: Budget[] }) {
  if (budgets.length === 0) {
    return (
      <Card className="border-dashed p-12 text-center">
        <p className="mb-4 text-muted-foreground">No active budgets found.</p>
        <Button size="sm">Manage budgets</Button>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {budgets.map((b) => (
        <BudgetCard key={b.id} budget={b} />
      ))}
    </div>
  );
}
