import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NO_BALANCE } from '../../test-utils.js';
import { AccountCard } from './AccountCard';

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

function renderCard(overrides: Partial<Account>, currencies: Currency[] = [AUD]) {
  render(
    <AccountCard
      account={account(overrides)}
      institutions={[]}
      currencies={currencies}
      onSelect={vi.fn()}
    />
  );
}

describe('AccountCard', () => {
  it('renders a liability balance negative and in the destructive tone', () => {
    renderCard({
      kind: 'credit-card',
      balance: { ...NO_BALANCE, basis: 'checkpoint', balanceCents: -213_755 },
    });
    const figure = screen.getByText('-$2,137.55');
    expect(figure.className).toContain('text-destructive');
  });

  it('renders a held balance positive and in the primary tone', () => {
    renderCard({ balance: { ...NO_BALANCE, basis: 'checkpoint', balanceCents: 100_000 } });
    const figure = screen.getByText('$1,000.00');
    expect(figure.className).toContain('text-primary');
  });

  it('shows the inconsistency icon with an accessible label when the balance is flagged', () => {
    renderCard({ balance: { ...NO_BALANCE, inconsistent: true } });
    expect(
      screen.getByRole('img', { name: "Balance doesn't match the latest checkpoint" })
    ).toBeInTheDocument();
  });

  it('shows no such icon when the balance is not flagged', () => {
    renderCard({ balance: { ...NO_BALANCE, inconsistent: false } });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows an as-of date for a checkpoint-anchored balance', () => {
    renderCard({ balance: { ...NO_BALANCE, basis: 'checkpoint', asOf: '2026-09-01' } });
    expect(screen.getByText(/as of 1 Sept/)).toBeInTheDocument();
  });

  it('shows no date for a transactions-basis balance', () => {
    renderCard({ balance: { ...NO_BALANCE, basis: 'transactions', asOf: '2026-09-01' } });
    expect(screen.queryByText(/as of/)).not.toBeInTheDocument();
  });

  it('keeps a person ledger neutral in tone but adds a direction note', () => {
    renderCard({ kind: 'person', balance: { ...NO_BALANCE, balanceCents: -5_000 } });
    expect(screen.getByText('you owe')).toBeInTheDocument();
  });

  it('says a settled-up person ledger is owed to no one', () => {
    renderCard({ kind: 'person', balance: { ...NO_BALANCE, balanceCents: 5_000 } });
    expect(screen.getByText('owed to you')).toBeInTheDocument();
  });

  it('keeps a points balance neutral in tone regardless of sign', () => {
    renderCard({ currency: 'QFF', balance: { ...NO_BALANCE, balanceCents: -5_000 } }, [QFF]);
    const figure = screen.getByText('-5,000 pts');
    expect(figure.className).toContain('text-muted-foreground');
    expect(figure.className).not.toContain('text-destructive');
  });
});
