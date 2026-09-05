import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../test-utils.js';
import { BalanceCard } from './BalanceCard';

import type { CurrencyFormat } from '@pops/finance';

import type { Account } from '../accounts/types';

const checkpointsHistory = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  checkpointsHistory: (...args: unknown[]) => checkpointsHistory(...args),
}));

const AUD: CurrencyFormat = { symbol: '$', decimals: 2, kind: 'fiat' };
const POINTS: CurrencyFormat = { symbol: null, decimals: 0, kind: 'points' };

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
    balance: NO_BALANCE,
    importStatus: NO_IMPORT_STATUS,
    transactionCount: NO_TRANSACTION_COUNT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const anchored = (balanceCents: number, asOf = '2026-09-01') => ({
  balanceCents,
  asOf,
  basis: 'checkpoint' as const,
  anchor: { checkpointId: 'c1', asOf, source: 'manual' as const },
  inconsistent: false,
});

function renderCard(props: { account: Account; currency?: CurrencyFormat }) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <BalanceCard account={props.account} currency={props.currency ?? AUD} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  checkpointsHistory.mockReset();
  checkpointsHistory.mockResolvedValue({ data: { data: [] } });
});

describe('BalanceCard figure', () => {
  it('shows the balance as the headline', () => {
    renderCard({ account: account({ balance: anchored(428_140) }) });
    expect(screen.getByText('$4,281.40')).toBeInTheDocument();
  });

  it('keeps a liability negative — nothing negates a balance before showing it', () => {
    renderCard({ account: account({ kind: 'credit-card', balance: anchored(-213_755) }) });

    const figure = screen.getByText('-$2,137.55');
    expect(figure).toBeInTheDocument();
    expect(figure).toHaveClass('text-destructive');
  });

  it('draws an asset in the positive tone', () => {
    renderCard({ account: account({ balance: anchored(428_140) }) });
    expect(screen.getByText('$4,281.40')).toHaveClass('text-primary');
  });

  it('leaves a points balance neutral however large — points are not spendable money', () => {
    renderCard({
      account: account({ kind: 'other', currency: 'QFF', balance: anchored(1_250_000) }),
      currency: POINTS,
    });
    expect(screen.getByText('12,500 pts')).toHaveClass('text-muted-foreground');
  });
});

describe('BalanceCard caption', () => {
  it('names the kind for an ordinary account', () => {
    renderCard({ account: account({ kind: 'credit-card', balance: anchored(-100) }) });
    expect(screen.getByText('Credit card balance')).toBeInTheDocument();
  });

  it('calls a gift card what it is — stored value, not a claim on money elsewhere', () => {
    renderCard({ account: account({ kind: 'gift-card', balance: anchored(5_000) }) });
    expect(screen.getByText('Remaining stored value')).toBeInTheDocument();
  });

  it('says who owes whom on a person ledger, which a minus sign cannot', () => {
    renderCard({
      account: account({ kind: 'person', entityDisplayName: 'Sam', balance: anchored(-4_500) }),
    });
    expect(screen.getByText('You owe Sam')).toBeInTheDocument();
  });

  it('flips the person sentence when they owe instead', () => {
    renderCard({
      account: account({ kind: 'person', entityDisplayName: 'Sam', balance: anchored(4_500) }),
    });
    expect(screen.getByText('Sam owes you')).toBeInTheDocument();
  });

  it('says settled when a person ledger is at zero', () => {
    renderCard({
      account: account({ kind: 'person', entityDisplayName: 'Sam', balance: anchored(0) }),
    });
    expect(screen.getByText('Settled up with Sam')).toBeInTheDocument();
  });
});

describe('BalanceCard provenance', () => {
  it('dates the balance when a checkpoint anchors it', () => {
    renderCard({ account: account({ balance: anchored(1_000, '2026-09-01') }) });
    expect(screen.getByText(/As of 1 Sept/)).toBeInTheDocument();
  });

  it('says a bank-checkable kind has never been checked when there is no checkpoint', () => {
    renderCard({ account: account({ kind: 'checking' }) });
    expect(screen.getByText(/never checked against the bank/)).toBeInTheDocument();
  });

  it('says a countable kind has never been counted', () => {
    renderCard({ account: account({ kind: 'cash' }) });
    expect(screen.getByText(/never counted/)).toBeInTheDocument();
  });

  it('never renders a placeholder date', () => {
    renderCard({ account: account({ kind: 'loan' }) });
    expect(screen.queryByText(/As of/)).not.toBeInTheDocument();
  });

  it('links out to the checkpoints page under the shell prefix that mounts it', () => {
    // `routes.tsx` declares its paths relative to the shell's `/finance/*`
    // mount, so an in-app link that omits the prefix matches no route at all.
    renderCard({ account: account({ id: 'a7' }) });
    expect(screen.getByRole('link', { name: 'Checkpoints' })).toHaveAttribute(
      'href',
      '/finance/accounts/a7/checkpoints'
    );
  });
});

describe('BalanceCard inconsistency flag', () => {
  it('is absent when the ledger and the checkpoints agree', () => {
    renderCard({ account: account({ balance: anchored(1_000) }) });
    expect(screen.queryByText('Disagrees with a checkpoint')).not.toBeInTheDocument();
  });

  it('announces a disagreement beside the caption', () => {
    renderCard({
      account: account({ balance: { ...anchored(1_000), inconsistent: true } }),
    });
    expect(screen.getByText('Disagrees with a checkpoint')).toBeInTheDocument();
  });

  it('flags a liability too, where the red figure alone would hide it', () => {
    renderCard({
      account: account({
        kind: 'credit-card',
        balance: { ...anchored(-213_755), inconsistent: true },
      }),
    });
    expect(screen.getByText('Disagrees with a checkpoint')).toBeInTheDocument();
  });
});

describe('BalanceCard trend', () => {
  it('renders nothing rather than a placeholder with fewer than two points', async () => {
    checkpointsHistory.mockResolvedValue({
      data: { data: [{ month: '2026-09', balanceCents: 1 }] },
    });
    renderCard({ account: account({}) });
    expect(await screen.findByText(/never checked/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('charts the series and says which way it went', async () => {
    checkpointsHistory.mockResolvedValue({
      data: {
        data: [
          { month: '2026-08', balanceCents: 400_000 },
          { month: '2026-09', balanceCents: 428_140 },
        ],
      },
    });
    renderCard({ account: account({ balance: anchored(428_140) }) });

    expect(await screen.findByText('Up $281.40 over 1 month')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Balance over 1 month');
  });

  it('counts the gaps between month-ends, not the readings', async () => {
    // Three month-end readings are two months apart. Counting the readings
    // themselves would claim a month that never elapsed.
    checkpointsHistory.mockResolvedValue({
      data: {
        data: [
          { month: '2026-07', balanceCents: 400_000 },
          { month: '2026-08', balanceCents: 410_000 },
          { month: '2026-09', balanceCents: 428_140 },
        ],
      },
    });
    renderCard({ account: account({ balance: anchored(428_140) }) });

    expect(await screen.findByText('Up $281.40 over 2 months')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Balance over 2 months');
  });

  it('reads a debt growing as Down, and draws it in the debt tone', async () => {
    checkpointsHistory.mockResolvedValue({
      data: {
        data: [
          { month: '2026-08', balanceCents: -180_000 },
          { month: '2026-09', balanceCents: -213_755 },
        ],
      },
    });
    renderCard({ account: account({ kind: 'credit-card', balance: anchored(-213_755) }) });

    expect(await screen.findByText('Down $337.55 over 1 month')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveClass('text-destructive');
  });
});
