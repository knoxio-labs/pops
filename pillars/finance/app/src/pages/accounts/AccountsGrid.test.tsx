import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NO_BALANCE } from '../../test-utils.js';
import { AccountsGrid } from './AccountsGrid';
import { useAccountListFilters } from './useAccountListFilters';

import type { Currency } from './account-subtotals';
import type { Account } from './types';

const AUD: Currency = {
  code: 'AUD',
  name: 'Australian Dollar',
  symbol: '$',
  decimals: 2,
  kind: 'fiat',
  createdAt: '',
};
const EUR: Currency = {
  code: 'EUR',
  name: 'Euro',
  symbol: '€',
  decimals: 2,
  kind: 'fiat',
  createdAt: '',
};
const QFF: Currency = {
  code: 'QFF',
  name: 'Qantas Points',
  symbol: null,
  decimals: 0,
  kind: 'points',
  createdAt: '',
};

function account(overrides: Partial<Account>): Account {
  return {
    id: 'id',
    name: 'Account',
    institutionId: null,
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    balance: NO_BALANCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function Harness({ accounts, currencies }: { accounts: Account[]; currencies: Currency[] }) {
  const filters = useAccountListFilters(accounts, [], []);
  return (
    <AccountsGrid
      isLoading={false}
      accounts={accounts}
      institutions={[]}
      currencies={currencies}
      filters={filters}
      onAdd={vi.fn()}
      onSelect={vi.fn()}
    />
  );
}

describe('AccountsGrid subtotals', () => {
  it('shows one net figure per currency, mixing AUD, EUR and points, points excluded', () => {
    const accounts = [
      account({ id: 'a', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: 100_000 } }),
      account({ id: 'b', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: -30_000 } }),
      account({ id: 'c', currency: 'EUR', balance: { ...NO_BALANCE, balanceCents: 5_000 } }),
      account({ id: 'd', currency: 'QFF', balance: { ...NO_BALANCE, balanceCents: 900_000 } }),
    ];
    render(<Harness accounts={accounts} currencies={[AUD, EUR, QFF]} />);
    const subtotals = within(screen.getByTestId('account-subtotals'));

    expect(subtotals.getByText('$700.00')).toBeInTheDocument();
    expect(subtotals.getByText('€50.00')).toBeInTheDocument();
    expect(subtotals.queryByText('QFF')).not.toBeInTheDocument();
    expect(subtotals.queryByText(/9,000 pts/)).not.toBeInTheDocument();
  });

  it('totals only what the search left on the page', async () => {
    const accounts = [
      account({
        id: 'a',
        name: 'Everyday',
        currency: 'AUD',
        balance: { ...NO_BALANCE, balanceCents: 100_000 },
      }),
      account({
        id: 'b',
        name: 'Rainy day',
        currency: 'AUD',
        balance: { ...NO_BALANCE, balanceCents: 30_000 },
      }),
    ];
    render(<Harness accounts={accounts} currencies={[AUD]} />);
    expect(
      within(screen.getByTestId('account-subtotals')).getByText('$1,300.00')
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search accounts'), 'Rainy');

    expect(
      within(screen.getByTestId('account-subtotals')).getByText('$300.00')
    ).toBeInTheDocument();
  });

  it('shows no subtotal at all beside the no-results empty state', async () => {
    // A nonzero total above "No accounts match" would describe accounts that
    // appear nowhere on the page.
    const accounts = [
      account({ id: 'a', name: 'Everyday', balance: { ...NO_BALANCE, balanceCents: 100_000 } }),
    ];
    render(<Harness accounts={accounts} currencies={[AUD]} />);

    await userEvent.type(screen.getByLabelText('Search accounts'), 'nothing matches this');

    expect(screen.getByText('No accounts match')).toBeInTheDocument();
    expect(screen.queryByTestId('account-subtotals')).not.toBeInTheDocument();
  });

  it('renders no subtotal row when every account is a points balance', () => {
    const accounts = [account({ id: 'a', currency: 'QFF', balance: NO_BALANCE })];
    render(<Harness accounts={accounts} currencies={[QFF]} />);
    expect(
      screen.queryByText(
        'Held minus owed, per currency — points are not counted, and nothing is converted.'
      )
    ).not.toBeInTheDocument();
  });
});
