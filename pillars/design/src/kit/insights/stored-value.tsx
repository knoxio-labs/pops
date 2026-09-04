import { formatBalance } from '@/fixtures/currencies';
import { ProgressBar } from '@/kit/sparkline';

import { Badge, Button, Separator } from '@pops/ui';

import type { AccountInsight, BalancePoint } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

import type { InsightModules } from './contract';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;
/** Points are priced against AUD in every fixture that carries `centsPerPoint`. */
const REFERENCE_CURRENCY = 'AUD';

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / MS_PER_DAY);
}

function monthlyBurnRate(history: BalancePoint[]): number {
  if (history.length < 2) return 0;
  const first = history.at(0)?.balance ?? 0;
  const last = history.at(-1)?.balance ?? 0;
  return (first - last) / (history.length - 1);
}

/**
 * Projects the trailing burn rate — the average monthly decline across the
 * 12-month history — forward at a constant pace to estimate whether the
 * remaining value clears before the card expires. Null when there is no
 * expiry to compare against.
 */
function giftCardOnTrack(
  remaining: number,
  burnPerMonth: number,
  daysToExpiry: number | null
): boolean | null {
  if (daysToExpiry === null) return null;
  if (remaining <= 0) return true;
  if (burnPerMonth <= 0) return false;
  const monthsToZero = remaining / burnPerMonth;
  const monthsToExpiry = daysToExpiry / DAYS_PER_MONTH;
  return monthsToZero <= monthsToExpiry;
}

function GiftCardBody({ account, insight }: { account: Account; insight: AccountInsight }) {
  if (insight.originalValue === undefined) return null;
  const original = insight.originalValue;
  const remaining = account.balance;
  const used = original - remaining;
  const fraction = original > 0 ? remaining / original : 0;
  const days = account.expires ? daysUntil(account.expires) : null;
  const onTrack = giftCardOnTrack(remaining, monthlyBurnRate(insight.history), days);
  return (
    <div className="space-y-3">
      <ProgressBar fraction={fraction} />
      <p className="text-sm text-muted-foreground">
        {formatBalance(remaining, account.currency)} left of{' '}
        {formatBalance(original, account.currency)} · {formatBalance(used, account.currency)} used
      </p>
      {days !== null && (
        <p className="flex items-center gap-2 text-sm">
          {days >= 0 ? `Expires in ${days} days` : `Expired ${Math.abs(days)} days ago`}
          {onTrack !== null && (
            <Badge variant={onTrack ? 'secondary' : 'destructive'}>
              {onTrack ? 'On track to use it up' : 'Will expire unspent at this rate'}
            </Badge>
          )}
        </p>
      )}
      {account.contact && (
        <p className="text-xs text-muted-foreground">Issued by {account.contact}</p>
      )}
    </div>
  );
}

/**
 * The one reading a sign cannot carry on its own: which way the debt runs.
 * The amount is not repeated here — the headline balance above already states
 * it, signed.
 */
function personSentence(who: string, owed: number): string {
  if (owed === 0) return `Settled up with ${who}`;
  return owed > 0 ? `${who} owes you` : `You owe ${who}`;
}

function largestMove(history: BalancePoint[], currency: string): string | null {
  if (history.length < 2) return null;
  let best = { delta: 0, month: '' };
  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];
    if (!current || !previous) continue;
    const delta = current.balance - previous.balance;
    if (Math.abs(delta) > Math.abs(best.delta)) best = { delta, month: current.month };
  }
  if (best.delta === 0) return null;
  const sign = best.delta > 0 ? '+' : '-';
  return `${sign}${formatBalance(Math.abs(best.delta), currency)} in ${best.month}`;
}

function PersonBody({ account, insight }: { account: Account; insight: AccountInsight }) {
  const who = account.contact ?? account.name;
  const owed = account.balance;
  const move = largestMove(insight.history, account.currency);
  return (
    <div className="space-y-3">
      <p className="text-sm">{personSentence(who, owed)}</p>
      {move && <p className="text-xs text-muted-foreground">Biggest single move: {move}</p>}
      {owed !== 0 && (
        <Button variant="outline" size="sm">
          Settle up {formatBalance(Math.abs(owed), account.currency)}
        </Button>
      )}
    </div>
  );
}

/**
 * Full points balance × its per-point indicative worth, in minor units of
 * the reference currency. Never sum this with a real balance — it is a
 * separate, softer number that only says roughly what the points could be
 * worth if redeemed today.
 */
function indicativeWorth(balance: number, centsPerPoint: number): number {
  return Math.round(balance * centsPerPoint);
}

function OtherBody({ account, insight }: { account: Account; insight: AccountInsight }) {
  const points = insight.points;
  if (!points) return null;
  const days = daysUntil(points.expiresOn);
  const annualProjection = Math.round(points.earnedLast90 * (365 / 90));
  const worth = indicativeWorth(account.balance, points.centsPerPoint);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {points.expiring.toLocaleString('en-AU')} pts expiring
        {days >= 0 ? ` in ${days} days` : ` ${Math.abs(days)} days ago`}
      </p>
      <p className="text-xs text-muted-foreground">
        Earned {points.earnedLast90.toLocaleString('en-AU')} pts in the last 90 days · projected{' '}
        {annualProjection.toLocaleString('en-AU')} pts/year
      </p>
      <Separator />
      <p className="flex items-center gap-2 text-sm">
        Indicative worth: {formatBalance(worth, REFERENCE_CURRENCY)}
        <Badge variant="outline">Indicative only</Badge>
      </p>
    </div>
  );
}

export const storedValueModules: InsightModules = {
  'gift-card': [{ id: 'gift-card-value', title: 'Stored value', Body: GiftCardBody }],
  person: [{ id: 'person-ledger', title: 'Ledger', Body: PersonBody }],
  other: [{ id: 'points-balance', title: 'Points', Body: OtherBody }],
};
