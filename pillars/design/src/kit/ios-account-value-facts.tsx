import { PopsButton } from '@/frames/ios/primitives';
import { IosMeter, IosStat, IosTag } from '@/kit/ios-controls';
import { countdown, daysUntil, FactCard, monthLabel, money, Note } from '@/kit/ios-fact-card';

import type { AccountInsight, BalancePoint } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

interface FactProps {
  account: Account;
  insight: AccountInsight;
}

function burnPerMonth(history: BalancePoint[]): number {
  if (history.length < 2) return 0;
  return ((history.at(0)?.balance ?? 0) - (history.at(-1)?.balance ?? 0)) / (history.length - 1);
}

function willLapse(remaining: number, burn: number, days: number): boolean {
  if (remaining <= 0) return false;
  if (burn <= 0) return true;
  return remaining / burn > days / 30.44;
}

/** Gift card: what is left of what was loaded, and whether it survives its expiry. */
export function GiftCardFacts({ account, insight }: FactProps) {
  const original = insight.originalValue;
  if (original === undefined || !account.expires) return null;
  const days = daysUntil(account.expires);
  const lapses = willLapse(account.balance, burnPerMonth(insight.history), days);
  return (
    <FactCard title="Stored value">
      <IosMeter fraction={account.balance / original} tone={lapses ? 'warning' : 'neutral'} />
      <p className="ios-subheadline">
        {money(account.balance, account.currency)} left of {money(original, account.currency)}
      </p>
      <div className="flex items-center gap-2">
        <span className="ios-subheadline">Expires {countdown(days)}</span>
        <IosTag tone={lapses ? 'warning' : 'success'}>
          {lapses ? 'Unspent at this rate' : 'On track to use it up'}
        </IosTag>
      </div>
    </FactCard>
  );
}

function largestMove(history: BalancePoint[], currency: string): string | null {
  let best = { delta: 0, month: '' };
  for (let i = 1; i < history.length; i += 1) {
    const current = history[i];
    const previous = history[i - 1];
    if (!current || !previous) continue;
    const delta = current.balance - previous.balance;
    if (Math.abs(delta) > Math.abs(best.delta)) best = { delta, month: current.month };
  }
  if (best.delta === 0) return null;
  return `${best.delta > 0 ? '+' : '−'}${money(Math.abs(best.delta), currency)} in ${monthLabel(best.month)}`;
}

/** Person ledger: which way it runs is the headline, so this card is the settling. */
export function PersonFacts({ account, insight }: FactProps) {
  const move = largestMove(insight.history, account.currency);
  const who = account.contact ?? account.name;
  return (
    <FactCard title="Ledger">
      <p className="ios-subheadline">
        {account.balance === 0
          ? `Settled up with ${who}`
          : `${account.transactionCount} entries with ${who}`}
      </p>
      {move === null ? null : <Note>Biggest single move: {move}</Note>}
      {account.balance === 0 ? null : (
        <PopsButton>Settle up {money(Math.abs(account.balance), account.currency)}</PopsButton>
      )}
    </FactCard>
  );
}

/**
 * Points: what expires, what is coming in, and what it is loosely worth. The
 * worth is in a different currency to the balance above it and must never be
 * added to one, which is what the tag is for.
 */
export function PointsFacts({ account, insight }: FactProps) {
  const points = insight.points;
  if (!points) return null;
  const days = daysUntil(points.expiresOn);
  const perYear = Math.round(points.earnedLast90 * (365 / 90));
  const worth = Math.round(account.balance * points.centsPerPoint);
  return (
    <FactCard title="Points">
      <div className="grid grid-cols-2 gap-3">
        <IosStat
          label="Expiring"
          value={`${points.expiring.toLocaleString('en-AU')} pts`}
          hint={countdown(days)}
        />
        <IosStat
          label="Earned in 90 days"
          value={`${points.earnedLast90.toLocaleString('en-AU')} pts`}
          hint={`${perYear.toLocaleString('en-AU')}/yr at this rate`}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="ios-subheadline">Worth about {money(worth, 'AUD')}</span>
        <IosTag>Indicative only</IosTag>
      </div>
    </FactCard>
  );
}
