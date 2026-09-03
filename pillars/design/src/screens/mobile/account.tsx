import { insightsByAccountId } from '@/fixtures/account-insights';
import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { accounts as allAccounts } from '@/fixtures/accounts';
import { currenciesByCode, formatBalance } from '@/fixtures/currencies';
import { PopsGlassButton, StateView } from '@/frames/ios/primitives';
import {
  accountSubtitle,
  asOfNote,
  balanceCaption,
  iosTone,
  readBalance,
  toneForBalance,
} from '@/kit/ios-account-balance';
import { AccountFacts } from '@/kit/ios-account-facts';
import { AccountMark } from '@/kit/ios-account-mark';
import { IosTag } from '@/kit/ios-controls';
import { FactCard, Note } from '@/kit/ios-fact-card';
import { IosSparkline } from '@/kit/ios-sparkline';
import { RecentTransactions } from '@/kit/ios-transaction-rows';
import { Plus } from 'lucide-react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { AccountInsight } from '@/fixtures/account-insights';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account', order: 4, frame: 'ios' };

const byId = (id: string) => allAccounts.find((a) => a.id === id);

/**
 * The colour follows the sign of the balance itself, not whether the line is
 * rising or falling: a loan's series is negative and stays the destructive
 * tone even as it climbs toward zero, because it is still debt. Points are
 * not money and stay neutral regardless of sign.
 */
function trend(account: Account, insight: AccountInsight) {
  const change = (insight.history.at(-1)?.balance ?? 0) - (insight.history.at(0)?.balance ?? 0);
  const line = `${change >= 0 ? 'Up' : 'Down'} ${formatBalance(Math.abs(change), account.currency)} over 12 months`;
  const isPoints = currenciesByCode.get(account.currency)?.kind === 'points';
  const colour = isPoints
    ? 'var(--ios-muted-foreground)'
    : iosTone(toneForBalance(account.balance));
  return { colour, line };
}

/** Kinds that only ever spend down: a credit landing in one is a fixture artefact. */
function spendsDown(account: Account): boolean {
  const kind = ACCOUNT_KINDS[account.kind];
  return kind.storedValue || account.kind === 'other';
}

function Header({ account }: { account: Account }) {
  const reading = readBalance(account);
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3">
        <AccountMark account={account} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="ios-title truncate">{account.name}</h1>
          <p className="ios-subheadline truncate" style={{ color: 'var(--ios-muted-foreground)' }}>
            {accountSubtitle(account)} · {ACCOUNT_KINDS[account.kind].label}
          </p>
        </div>
        {account.archived ? <IosTag>Archived</IosTag> : null}
      </div>
      <div className="space-y-1">
        <p className="ios-section-label uppercase" style={{ color: 'var(--ios-muted-foreground)' }}>
          {balanceCaption(account)}
        </p>
        <p className="ios-amount" style={{ color: iosTone(reading.tone) }}>
          {reading.amount}
        </p>
        <Note>
          {asOfNote(account)} · {account.transactionCount.toLocaleString('en-AU')} transactions
        </Note>
      </div>
    </header>
  );
}

function TrendCard({ account, insight }: { account: Account; insight: AccountInsight }) {
  const { colour, line } = trend(account, insight);
  return (
    <FactCard title="Twelve months">
      <IosSparkline points={insight.history} colour={colour} />
      <p className="ios-subheadline" style={{ color: colour }}>
        {line}
      </p>
    </FactCard>
  );
}

/**
 * One account on the phone. The header carries the whole identity and the
 * balance is the headline, because on a 393pt screen anything below the fold
 * is a decision to scroll — everything under it is the kind's own facts,
 * re-expressed as single-column cards rather than a grid.
 *
 * Import has no button here: it is a desktop-scale job (a file, a review
 * table) that this screen only ever launches, never performs, so it does not
 * compete with the one thing a phone is actually good at doing on the
 * spot — logging what you just spent. That single action is a floating hero
 * button rather than a bottom bar, so it reads as the screen's one verb
 * instead of one of a pair.
 */
export function AccountPage({ account }: { account: Account }) {
  const insight = insightsByAccountId[account.id];
  return (
    <div className="relative h-full">
      <div className="space-y-4 p-4 pb-24">
        <Header account={account} />
        {insight ? <TrendCard account={account} insight={insight} /> : null}
        {insight ? <AccountFacts account={account} insight={insight} /> : null}
        <RecentTransactions currency={account.currency} spendOnly={spendsDown(account)} />
      </div>
      <PopsGlassButton label="Add transaction">
        <Plus size={18} />
        <span className="ios-headline">Add</span>
      </PopsGlassButton>
    </div>
  );
}

function State({ id }: { id: string }) {
  const account = byId(id);
  if (!account) return <StateView message="No such account." tone="destructive" />;
  return <AccountPage account={account} />;
}

export const states: ScreenStates = {
  checking: () => <State id="a1" />,
  'credit-card': () => <State id="a2" />,
  'gift-card': () => <State id="a6" />,
  person: () => <State id="a7" />,
  points: () => <State id="a9" />,
};

export default function AccountScreen() {
  return <State id="a1" />;
}
