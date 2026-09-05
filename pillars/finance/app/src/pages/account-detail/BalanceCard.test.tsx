import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BalanceCard } from './BalanceCard';

import type { Account } from '../accounts/types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'a1',
    name: 'Account',
    institutionId: null,
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * The real `accounts` wire schema has no balance field (POPS-2750 has not
 * shipped), so nothing here may render a number or a $-anything — a
 * fabricated figure would fail this test even if it were "plausible", which
 * is exactly the point: there is no source of truth for one yet.
 */
function expectNoFabricatedNumber() {
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^-?\d/)).not.toBeInTheDocument();
}

describe('BalanceCard', () => {
  it('never shows a balance figure for a kind with an external statement', () => {
    render(<BalanceCard account={account({ kind: 'checking' })} />);
    expect(screen.getByText('Not tracked yet')).toBeInTheDocument();
    expect(screen.getByText(/check against your statements/)).toBeInTheDocument();
    expectNoFabricatedNumber();
  });

  it('says the same for a liability kind — no asset framing leaks in', () => {
    render(<BalanceCard account={account({ kind: 'credit-card' })} />);
    expect(screen.getByText(/check against your statements/)).toBeInTheDocument();
    expectNoFabricatedNumber();
  });

  it('gives a stored-value kind a different, true sentence', () => {
    render(<BalanceCard account={account({ kind: 'gift-card' })} />);
    expect(screen.getByText(/track the stored value directly/)).toBeInTheDocument();
    expectNoFabricatedNumber();
  });

  it('gives a kind with no external balance a transactions-derived sentence', () => {
    render(<BalanceCard account={account({ kind: 'cash' })} />);
    expect(screen.getByText(/derived from transactions/)).toBeInTheDocument();
    expectNoFabricatedNumber();
  });

  it('never renders a placeholder date', () => {
    render(<BalanceCard account={account({ kind: 'loan' })} />);
    expect(screen.queryByText(/As of/)).not.toBeInTheDocument();
  });
});
