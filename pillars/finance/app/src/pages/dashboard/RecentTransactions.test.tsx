import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { RecentTransactions } from './RecentTransactions';

import type { TransactionsListResponse } from '../../finance-api/types.gen.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

function makeTransaction(tags: string[]): Transaction {
  return {
    account: 'Everyday',
    amount: -12.5,
    country: null,
    date: '2026-08-01',
    description: 'Coffee',
    entityId: null,
    entityName: null,
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxFeeCents: null,
    fxCaptureSource: null,
    id: 't1',
    lastEditedTime: '2026-08-01T00:00:00Z',
    location: null,
    notes: null,
    relatedTransactionId: null,
    tags,
    type: 'purchase',
  };
}

function renderRow(tags: string[]) {
  return render(
    <MemoryRouter>
      <RecentTransactions transactions={[makeTransaction(tags)]} isLoading={false} />
    </MemoryRouter>
  );
}

describe('RecentTransactions', () => {
  it('badges a transaction tagged with the namespaced online channel', () => {
    renderRow(['channel:online', 'venue:cafe']);

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('does not badge a transaction on another channel', () => {
    renderRow(['channel:in-person']);

    expect(screen.queryByText('Online')).toBeNull();
  });

  it('does not badge on a value from another facet that happens to be "online"', () => {
    renderRow(['project:online']);

    expect(screen.queryByText('Online')).toBeNull();
  });

  it('does not badge an untagged transaction', () => {
    renderRow([]);

    expect(screen.queryByText('Online')).toBeNull();
  });
});
