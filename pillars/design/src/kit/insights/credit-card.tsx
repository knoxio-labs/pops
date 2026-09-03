import { formatBalance } from '@/fixtures/currencies';
import { ledgerTone } from '@/kit/ledger-tone';
import { ProgressBar } from '@/kit/sparkline';

import { Badge } from '@pops/ui';

import { Empty, Stat } from './atoms';

import type { AccountInsight } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

import type { InsightModule } from './contract';

interface BodyProps {
  account: Account;
  insight: AccountInsight;
}

function daysTo(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`;
  return days === 0 ? 'today' : `in ${days} days`;
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
        <Stat label="Spent this cycle" value={money(card.cycleSpend)} hint={closes} />
        <Badge variant={due <= 7 ? 'destructive' : 'secondary'}>Due {countdown(due)}</Badge>
      </div>
      <p className={change > 0 ? 'text-sm text-destructive' : 'text-sm text-primary'}>{against}</p>
    </div>
  );
}

/**
 * The three figures the headline balance does not give you: the limit it is
 * drawn against, the amount owed, and what is left to spend. Owed is a
 * magnitude and takes no tone; the remaining limit is real spendable money and
 * is the one green number on a credit card's page.
 */
function CardUtilisation({ account, insight }: BodyProps) {
  const card = insight.card;
  if (!card) return <Empty>No credit limit recorded, so utilisation cannot be shown.</Empty>;
  const money = (n: number) => formatBalance(n, account.currency);
  const owed = -account.balance;
  const remaining = card.creditLimit - owed;
  const fraction = owed / card.creditLimit;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold tabular-nums">{Math.round(fraction * 100)}%</p>
        <span className="text-xs text-muted-foreground">of {money(card.creditLimit)} limit</span>
      </div>
      <ProgressBar
        fraction={fraction}
        className={fraction > 0.3 ? 'bg-destructive' : 'bg-primary'}
      />
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Remaining limit"
          value={money(remaining)}
          tone={ledgerTone(remaining)}
          hint="Yours to spend"
        />
        <Stat label="Owed" value={money(owed)} hint="Against the limit" />
      </div>
    </div>
  );
}

/**
 * A credit card's own modules. The four figures the reviewer named are split
 * across the page: the headline is the ledger balance, negative and red, and
 * the limit, the amount owed and the remaining limit sit together here where
 * the arithmetic between them can be read in one place.
 */
export const cardModules: InsightModule[] = [
  { id: 'card-cycle', title: 'This cycle', Body: CardCycle },
  { id: 'card-utilisation', title: 'Utilisation', Body: CardUtilisation },
];
