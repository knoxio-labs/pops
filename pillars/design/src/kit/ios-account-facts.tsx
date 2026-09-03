import { GiftCardFacts, PersonFacts, PointsFacts } from '@/kit/ios-account-value-facts';
import { IosMeter, IosStat, IosTag } from '@/kit/ios-controls';
import { countdown, daysUntil, FactCard, monthLabel, money, Note } from '@/kit/ios-fact-card';

import type { AccountInsight } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

interface FactProps {
  account: Account;
  insight: AccountInsight;
}

/**
 * Checking: what the month did, and how low it went. Both are read off the
 * closing balances rather than the transactions, which the note says out loud
 * — money in and money out are not counted separately here.
 */
function CheckingFacts({ account, insight }: FactProps) {
  const history = insight.history;
  const last = history.at(-1);
  const prior = history.at(-2);
  const floor = history.toSorted((a, b) => a.balance - b.balance)[0];
  if (!last || !prior || !floor) return null;
  const average = Math.round(
    (last.balance - (history.at(0)?.balance ?? 0)) / (history.length - 1) || 0
  );
  return (
    <FactCard title="Month on month">
      <div className="grid grid-cols-2 gap-3">
        <IosStat
          label={`Net in ${monthLabel(last.month)}`}
          value={money(last.balance - prior.balance, account.currency)}
        />
        <IosStat label="Average month" value={money(average, account.currency)} />
      </div>
      <IosStat
        label="Lowest it went"
        value={money(floor.balance, account.currency)}
        hint={monthLabel(floor.month)}
      />
      <Note>From closing balances, not transactions: money in and out are not counted apart.</Note>
    </FactCard>
  );
}

/**
 * Credit card: when the money is due, and how much of the limit is gone. The
 * cycle and the limit are two cards on the web; at this width they are one,
 * because a card's whole question is "how much, by when, and how much room is
 * left".
 */
function CardFacts({ account, insight }: FactProps) {
  const card = insight.card;
  if (!card) return null;
  const due = daysUntil(card.dueOn);
  const change = card.cycleSpend - card.previousCycleSpend;
  const fraction = Math.abs(account.balance) / card.creditLimit;
  const available = Math.max(card.creditLimit - Math.abs(account.balance), 0);
  return (
    <FactCard title="This cycle">
      <div className="flex items-center gap-2">
        <IosTag tone={due <= 7 ? 'destructive' : 'neutral'}>Due {countdown(due)}</IosTag>
        <IosTag>Closes {countdown(daysUntil(card.closesOn))}</IosTag>
      </div>
      <IosStat
        label="Spent this cycle"
        value={money(card.cycleSpend, account.currency)}
        hint={`${change > 0 ? 'Up' : 'Down'} ${money(Math.abs(change), account.currency)} on last cycle`}
      />
      <IosMeter fraction={fraction} tone={fraction > 0.3 ? 'warning' : 'neutral'} />
      <Note>
        {Math.round(fraction * 100)}% of {money(card.creditLimit, account.currency)} used ·{' '}
        {money(available, account.currency)} available
      </Note>
    </FactCard>
  );
}

/**
 * The facts an account's kind earns, re-expressed for 393pt. A kind nothing
 * has been designed for renders nothing rather than an empty card, which is
 * the same call the web dashboard makes.
 */
export function AccountFacts({ account, insight }: FactProps) {
  const kind = account.kind;
  if (kind === 'checking' || kind === 'savings') {
    return <CheckingFacts account={account} insight={insight} />;
  }
  if (kind === 'credit-card') return <CardFacts account={account} insight={insight} />;
  if (kind === 'gift-card') return <GiftCardFacts account={account} insight={insight} />;
  if (kind === 'person') return <PersonFacts account={account} insight={insight} />;
  if (kind === 'other') return <PointsFacts account={account} insight={insight} />;
  return null;
}
