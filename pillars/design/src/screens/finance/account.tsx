import { accounts } from '@/fixtures/accounts';
import { AccountDashboard } from '@/kit/account-dashboard';

import { EmptyState } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account', order: 6, frame: 'web' };

const byId = new Map(accounts.map((a) => [a.id, a]));

const detail = (id: string) => () => {
  const account = byId.get(id);
  return account ? <AccountDashboard account={account} /> : <EmptyState title="No such account" />;
};

export const states: ScreenStates = {
  checking: detail('a1'),
  savings: detail('a4'),
  'credit-card': detail('a2'),
  cash: detail('a5'),
  'gift-card': detail('a6'),
  person: detail('a7'),
  points: detail('a9'),
  loan: detail('a11'),
  archived: detail('a10'),
};

export default detail('a1');
