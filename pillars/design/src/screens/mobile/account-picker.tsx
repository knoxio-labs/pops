import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { accounts as allAccounts, activeAccounts } from '@/fixtures/accounts';
import { PopsCard, PopsRow } from '@/frames/ios/primitives';
import { accountSubtitle } from '@/kit/ios-account-balance';
import { AccountRow } from '@/kit/ios-account-row';
import { IosHairline, IosSearchField, IosSectionHeader } from '@/kit/ios-controls';
import { IosKeyboard } from '@/kit/ios-keyboard';
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account picker', order: 3, frame: 'ios' };

const MARK_INSET = 50;
const SELECTED = 'a2';

function matches(account: Account, query: string): boolean {
  const haystack = [account.name, accountSubtitle(account), ACCOUNT_KINDS[account.kind].label].join(
    ' '
  );
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function BehindTheSheet() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="ios-large-title">New transaction</h1>
      <p className="ios-amount">$48.20</p>
      <PopsCard>
        <PopsRow title="Date" trailing={<span className="ios-body">3 Sep 2026</span>} />
        <IosHairline />
        <PopsRow
          title="Account"
          trailing={
            <span
              className="ios-body flex items-center gap-1"
              style={{ color: 'var(--ios-accent)' }}
            >
              Amex
              <ChevronRight size={16} />
            </span>
          }
        />
        <IosHairline />
        <PopsRow title="Entity" trailing={<span className="ios-body">Woolworths</span>} />
      </PopsCard>
    </div>
  );
}

function PickerList({ accounts, query }: { accounts: Account[]; query: string }) {
  const shown = accounts.filter((account) => matches(account, query));
  const active = shown.filter((a) => !a.archived);
  const archived = shown.filter((a) => a.archived);
  return (
    <div className="space-y-4 px-4 pb-4">
      <PopsCard>
        {active.map((account, index) => (
          <Fragment key={account.id}>
            {index > 0 ? <IosHairline inset={MARK_INSET} /> : null}
            <AccountRow
              account={account}
              subtitle={ACCOUNT_KINDS[account.kind].label}
              selected={account.id === SELECTED}
            />
          </Fragment>
        ))}
      </PopsCard>
      {archived.length === 0 ? null : (
        <section className="space-y-2">
          <IosSectionHeader>Archived</IosSectionHeader>
          <PopsCard>
            {archived.map((account, index) => (
              <Fragment key={account.id}>
                {index > 0 ? <IosHairline inset={MARK_INSET} /> : null}
                <AccountRow account={account} subtitle={ACCOUNT_KINDS[account.kind].label} />
              </Fragment>
            ))}
          </PopsCard>
        </section>
      )}
    </div>
  );
}

function SheetHead({ query, keyboard }: { query: string; keyboard: boolean }) {
  return (
    <div className="shrink-0 space-y-3 px-4 pb-3">
      <div className="flex justify-center pt-2 pb-1" aria-hidden>
        <span className="h-[5px] w-9 rounded-full" style={{ background: 'var(--ios-separator)' }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="ios-title">Account</h2>
        <span className="ios-body" style={{ color: 'var(--ios-accent)' }}>
          {keyboard ? 'Cancel' : 'Done'}
        </span>
      </div>
      <IosSearchField value={query} placeholder="Search accounts" />
    </div>
  );
}

/**
 * Picking an account on a phone is a sheet, not the web's popover: it slides
 * from the bottom, it is reachable with a thumb, and the field it was opened
 * from stays visible behind it so the transaction being filed is never out of
 * sight.
 *
 * The balance is on every row because the account being filed against is
 * chosen by what it holds as often as by its name — and it carries the same
 * ledger-signed reading the list uses, so a card in debt still shows red
 * here.
 */
export function AccountPickerSheet({
  accounts,
  query = '',
  keyboard = false,
}: {
  accounts: Account[];
  query?: string;
  keyboard?: boolean;
}) {
  return (
    <div className="relative h-full overflow-hidden">
      <BehindTheSheet />
      <div className="absolute inset-0" style={{ background: 'rgb(0 0 0 / 0.35)' }} aria-hidden />
      <div
        className="absolute inset-x-0 flex flex-col rounded-t-[12px] shadow-2xl"
        style={{
          top: keyboard ? 24 : 132,
          bottom: keyboard ? 291 : 0,
          background: 'var(--ios-background)',
        }}
      >
        <SheetHead query={query} keyboard={keyboard} />
        <div className="flex-1 overflow-y-auto">
          <PickerList accounts={accounts} query={query} />
        </div>
      </div>
      {keyboard ? (
        <div className="absolute inset-x-0 bottom-0">
          <IosKeyboard />
        </div>
      ) : null}
    </div>
  );
}

export const states: ScreenStates = {
  searching: () => <AccountPickerSheet accounts={activeAccounts} query="cred" keyboard />,
  'archived-revealed': () => <AccountPickerSheet accounts={allAccounts} />,
};

export default function AccountPickerScreen() {
  return <AccountPickerSheet accounts={activeAccounts} />;
}
