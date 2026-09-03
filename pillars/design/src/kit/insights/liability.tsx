import { formatBalance } from '@/fixtures/currencies';
import { ProgressBar, Sparkline } from '@/kit/sparkline';

import { Badge } from '@pops/ui';

import type { AccountInsight, BalancePoint } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

import type { InsightModules } from './contract';

const EXTRA_REPAYMENTS = [10_000, 50_000];

interface BodyProps {
  account: Account;
  insight: AccountInsight;
}

interface Amortisation {
  /** Repayments until the balance reaches zero. */
  months: number;
  totalInterest: number;
  /** Owed after each repayment, today's balance first. */
  path: number[];
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function shiftMonth(month: string, count: number): Date {
  const [year, index] = month.split('-');
  return new Date(Number(year), Number(index) - 1 + count, 1);
}

function isoMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function years(months: number): string {
  const whole = Math.floor(months / 12);
  return whole === 0 ? `${months} months` : `${whole} yr ${months % 12} mo`;
}

function daysTo(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`;
  return days === 0 ? 'today' : `in ${days} days`;
}

/**
 * The schedule this loan runs from today at a fixed repayment: each month the
 * balance takes `annualRatePct / 12` in interest and the repayment then lands
 * against the total, so `owed → owed × (1 + r) − repayment` until it reaches
 * zero. Null when a repayment never clears one month's interest — a loan that
 * does not amortise at all, rather than one with a distant payoff.
 *
 * A projection, not a schedule: the rate never moves, no repayment is missed,
 * and the loan is never redrawn.
 */
function amortise(balance: number, annualRatePct: number, repayment: number): Amortisation | null {
  const rate = annualRatePct / 100 / 12;
  let owed = Math.abs(balance);
  if (repayment <= owed * rate) return null;
  const path = [owed];
  let totalInterest = 0;
  while (owed > 0 && path.length <= 720) {
    const interest = owed * rate;
    owed = Math.max(0, owed + interest - repayment);
    totalInterest += interest;
    path.push(owed);
  }
  return { months: path.length - 1, totalInterest: Math.round(totalInterest), path };
}

function arcOf(history: BalancePoint[], path: number[], from: string): BalancePoint[] {
  const owed = (balance: number, i: number) => ({
    month: isoMonth(shiftMonth(from, i + 1)),
    balance,
  });
  return [
    ...history.map((p) => ({ month: p.month, balance: Math.abs(p.balance) })),
    ...path.slice(1).map(owed),
  ];
}

function LoanArc({ account, insight }: BodyProps) {
  const loan = insight.loan;
  if (!loan) return <Empty>No loan terms recorded, so nothing to project from.</Empty>;
  const plan = amortise(account.balance, loan.annualRatePct, loan.monthlyRepayment);
  if (!plan) return <Empty>The repayment misses the interest; the balance never falls.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const from = insight.history.at(-1)?.month ?? isoMonth(new Date());
  const arc = arcOf(insight.history, plan.path, from);
  const ahead = ((arc.length - insight.history.length) / (arc.length - 1)) * 100;
  const caption = `Twelve months owed, then projected at ${money(loan.monthlyRepayment)} a month and ${loan.annualRatePct}% p.a. The faded stretch has not happened.`;
  const cleared = monthLabel(shiftMonth(from, plan.months));
  const borrowed = `On ${money(loan.originalPrincipal)} borrowed`;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Sparkline points={arc} className="h-24 text-destructive" />
        <div
          className="absolute inset-y-0 right-0 border-l border-dashed border-muted-foreground bg-background/65"
          style={{ width: `${ahead}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Cleared" value={cleared} hint={`${years(plan.months)} to run`} />
        <Stat label="Interest still to pay" value={money(plan.totalInterest)} hint={borrowed} />
      </div>
    </div>
  );
}

function NextRepayment({ account, insight }: BodyProps) {
  const loan = insight.loan;
  if (!loan) return <Empty>No loan terms recorded, so the split cannot be worked out.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const interest = Math.round((Math.abs(account.balance) * loan.annualRatePct) / 100 / 12);
  const principal = loan.monthlyRepayment - interest;
  if (principal <= 0) return <Empty>All of the repayment is interest; the balance holds.</Empty>;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold tabular-nums">{money(loan.monthlyRepayment)}</p>
        <Badge variant="secondary">
          {Math.round((interest / loan.monthlyRepayment) * 100)}% interest
        </Badge>
      </div>
      <ProgressBar fraction={interest / loan.monthlyRepayment} className="bg-destructive" />
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Interest" value={money(interest)} hint="Gone" />
        <Stat label="Principal" value={money(principal)} hint="Off the balance" />
      </div>
    </div>
  );
}

function ExtraRepayment({ account, insight }: BodyProps) {
  const loan = insight.loan;
  if (!loan) return <Empty>No loan terms recorded, so nothing to pay extra against.</Empty>;
  const base = amortise(account.balance, loan.annualRatePct, loan.monthlyRepayment);
  if (!base) return <Empty>The repayment misses the interest; any extra is guesswork.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const from = insight.history.at(-1)?.month ?? isoMonth(new Date());
  const baseline = `Against ${monthLabel(shiftMonth(from, base.months))} and ${money(base.totalInterest)} of interest at the current repayment.`;
  return (
    <div className="space-y-2">
      {EXTRA_REPAYMENTS.map((extra) => {
        const plan = amortise(account.balance, loan.annualRatePct, loan.monthlyRepayment + extra);
        if (!plan) return null;
        const gain = `${monthLabel(shiftMonth(from, plan.months))} · ${years(base.months - plan.months)} sooner · saves ${money(base.totalInterest - plan.totalInterest)}`;
        return (
          <p className="flex justify-between gap-3 text-sm tabular-nums" key={extra}>
            <span className="font-medium">+{money(extra)}/mo</span>
            <span className="text-muted-foreground">{gain}</span>
          </p>
        );
      })}
      <p className="text-xs text-muted-foreground">{baseline}</p>
    </div>
  );
}

function CardCycle({ account, insight }: BodyProps) {
  const card = insight.card;
  if (!card) return <Empty>No statement cycle recorded for this card.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const due = daysTo(card.dueOn);
  const change = card.cycleSpend - card.previousCycleSpend;
  const closes = `Closes ${countdown(daysTo(card.closesOn))}`;
  const against = `${change > 0 ? 'Up' : 'Down'} ${money(Math.abs(change))} on last cycle's ${money(card.previousCycleSpend)}`;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Stat label="Owed" value={money(Math.abs(account.balance))} hint={closes} />
        <Badge variant={due <= 7 ? 'destructive' : 'secondary'}>Due {countdown(due)}</Badge>
      </div>
      <Stat label="Spent this cycle" value={money(card.cycleSpend)} />
      <p className={change > 0 ? 'text-sm text-destructive' : 'text-sm text-primary'}>{against}</p>
    </div>
  );
}

function CardUtilisation({ account, insight }: BodyProps) {
  const card = insight.card;
  if (!card) return <Empty>No credit limit recorded, so utilisation cannot be shown.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const left = Math.max(card.creditLimit - Math.abs(account.balance), 0);
  const fraction = Math.abs(account.balance) / card.creditLimit;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold tabular-nums">{Math.round(fraction * 100)}%</p>
        <span className="text-xs text-muted-foreground">of {money(card.creditLimit)}</span>
      </div>
      <ProgressBar
        fraction={fraction}
        className={fraction > 0.3 ? 'bg-destructive' : 'bg-primary'}
      />
      <Stat label="Available" value={money(left)} />
    </div>
  );
}

/** The dashboards for the kinds whose balance is money owed. */
export const liabilityModules: InsightModules = {
  loan: [
    { id: 'loan-arc', title: 'Balance and payoff', span: 2, Body: LoanArc },
    { id: 'loan-next-repayment', title: 'Next repayment', Body: NextRepayment },
    { id: 'loan-extra-repayment', title: 'Paying extra', Body: ExtraRepayment },
  ],
  'credit-card': [
    { id: 'card-cycle', title: 'This cycle', Body: CardCycle },
    { id: 'card-utilisation', title: 'Utilisation', Body: CardUtilisation },
  ],
};
