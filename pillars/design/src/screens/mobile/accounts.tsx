import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { accounts as allAccounts, activeAccounts } from '@/fixtures/accounts';
import { StateView } from '@/frames/ios/primitives';
import { iosTone, readBalance } from '@/kit/ios-account-balance';
import { AccountMark } from '@/kit/ios-account-mark';
import {
  IosCollapsedTitleBar,
  IosSearchField,
  IosSectionHeader,
  useIosCollapsedTitle,
} from '@/kit/ios-controls';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Accounts', order: 2, frame: 'ios' };

const SECTIONS: { test: (balance: number) => boolean; label: string }[] = [
  { test: (balance) => balance >= 0, label: 'Held' },
  { test: (balance) => balance < 0, label: 'Owed' },
];

function AccountCard({ account }: { account: Account }) {
  const reading = readBalance(account);
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl p-3"
      style={{
        background: 'var(--ios-surface)',
        border: '1px solid var(--ios-separator)',
        opacity: account.archived ? 0.55 : 1,
      }}
    >
      <AccountMark account={account} size="sm" />
      <div className="min-w-0">
        <p className="ios-subheadline truncate font-semibold">{account.name}</p>
        <p className="ios-caption truncate" style={{ color: 'var(--ios-muted-foreground)' }}>
          {ACCOUNT_KINDS[account.kind].label}
        </p>
      </div>
      <div className="min-w-0">
        <p className="ios-headline truncate tabular-nums" style={{ color: iosTone(reading.tone) }}>
          {reading.amount}
        </p>
        {reading.note === undefined ? null : (
          <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
            {reading.note}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ label, accounts }: { label: string; accounts: Account[] }) {
  if (accounts.length === 0) return null;
  return (
    <section className="space-y-2">
      <IosSectionHeader>{label}</IosSectionHeader>
      <div className="grid grid-cols-2 gap-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </section>
  );
}

function countLine(accounts: Account[]): string {
  const archived = accounts.filter((a) => a.archived).length;
  const active = accounts.length - archived;
  const noun = active === 1 ? 'account' : 'accounts';
  return archived === 0 ? `${active} ${noun}` : `${active} ${noun} · ${archived} archived`;
}

/**
 * The accounts list at 393pt, as a card grid rather than a table row: a
 * tile carries a mark, a name and a balance at once, which is the same
 * "scannable at a glance" bet the web grid made — and the phone has the
 * width for two of them side by side. The list still sections by what the
 * balance *is*, money you can use or money you owe, because the grid does
 * not replace that decision, only the shape of a single row.
 */
export function AccountsList({ accounts }: { accounts: Account[] }) {
  const archived = accounts.filter((a) => a.archived);
  const { collapsed, anchor } = useIosCollapsedTitle();
  return (
    <div ref={anchor} className="space-y-4 p-4">
      <IosCollapsedTitleBar title="Accounts" visible={collapsed} />
      <header className="space-y-1">
        <h1 className="ios-large-title">Accounts</h1>
        <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
          {countLine(accounts)}
        </p>
      </header>
      <IosSearchField placeholder="Search accounts" />
      {SECTIONS.map(({ test, label }) => (
        <Section
          key={label}
          label={label}
          accounts={accounts.filter((a) => !a.archived && test(a.balance))}
        />
      ))}
      <Section label="Archived" accounts={archived} />
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => (
    <StateView message="No accounts yet. Accounts are created on the desktop; this is where they are read." />
  ),
  'archived-shown': () => <AccountsList accounts={allAccounts} />,
};

export default function AccountsScreen() {
  return <AccountsList accounts={activeAccounts} />;
}
