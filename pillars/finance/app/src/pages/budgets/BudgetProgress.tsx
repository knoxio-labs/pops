import { Badge, Progress } from '@pops/ui';

export interface BudgetProgressInput {
  spent: number;
  amount: number | null;
}

export interface BudgetProgressStats {
  /** True once spending has exceeded the budgeted amount. */
  overBudget: boolean;
  /** Raw spent/amount percentage — can exceed 100. `null` with no target amount. */
  pct: number | null;
  /** `pct` rounded for display. `null` with no target amount. */
  display: number | null;
  /** `pct` clamped to [0, 100] for the progress bar. `null` with no target amount. */
  visual: number | null;
}

/** Shared spent-vs-budget math for the budgets table and the dashboard cards. */
export function computeBudgetProgress({ spent, amount }: BudgetProgressInput): BudgetProgressStats {
  const overBudget = amount !== null && spent > amount;
  if (amount === null || amount <= 0) {
    return { overBudget, pct: null, display: null, visual: null };
  }
  const pct = (spent / amount) * 100;
  return {
    overBudget,
    pct,
    display: Math.round(pct),
    visual: Math.min(100, Math.max(0, pct)),
  };
}

/** Spent amount as a badge, destructive once over budget. */
export function BudgetSpentBadge({ spent, amount }: BudgetProgressInput) {
  const { overBudget } = computeBudgetProgress({ spent, amount });
  return (
    <Badge variant={overBudget ? 'destructive' : 'default'} className="font-mono tabular-nums">
      ${spent.toFixed(2)}
    </Badge>
  );
}

/** Progress bar + percentage label. Renders "—" when there's no target amount. */
export function BudgetProgressBar({ spent, amount }: BudgetProgressInput) {
  const { pct, display, visual } = computeBudgetProgress({ spent, amount });
  if (pct === null || display === null || visual === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex min-w-30 items-center gap-2">
      <Progress value={visual} className="flex-1" />
      <span
        className={`w-12 text-right font-mono text-xs tabular-nums ${
          pct > 100 ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {display}%
      </span>
    </div>
  );
}
