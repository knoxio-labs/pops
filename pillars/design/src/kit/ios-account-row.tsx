import { PopsRow } from '@/frames/ios/primitives';
import { readBalance, iosTone } from '@/kit/ios-account-balance';
import { AccountMark } from '@/kit/ios-account-mark';
import { Check } from 'lucide-react';

import type { Account } from '@/fixtures/accounts';

/**
 * The balance as a list row shows it: the signed amount, in the tone its
 * sign implies. Only a person ledger keeps a word under it — "you owe" or
 * "owed to you" — because that is the one case a bare sign cannot say which
 * of two people it is talking about.
 */
export function RowBalance({ account }: { account: Account }) {
  const { amount, note, tone } = readBalance(account);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <span className="ios-headline tabular-nums" style={{ color: iosTone(tone) }}>
        {amount}
      </span>
      {note === undefined ? null : (
        <span className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
          {note}
        </span>
      )}
    </span>
  );
}

/**
 * One account in a list, on the phone: mark, name, who it is with, balance.
 *
 * The name truncates and the balance does not, which is the trade this width
 * forces — an account with no room left for its name is still identified by
 * its mark, and a balance cut in half identifies nothing.
 */
export function AccountRow({
  account,
  subtitle,
  selected = false,
}: {
  account: Account;
  subtitle: string;
  selected?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2" style={{ opacity: account.archived ? 0.55 : 1 }}>
      <AccountMark account={account} />
      <div className="min-w-0 flex-1">
        <PopsRow
          title={account.name}
          subtitle={subtitle}
          trailing={
            <span className="flex items-center gap-2">
              <RowBalance account={account} />
              {selected ? <Check size={18} style={{ color: 'var(--ios-accent)' }} /> : null}
            </span>
          }
        />
      </div>
    </div>
  );
}
