import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentPurchasesCard } from './RecentPurchasesCard';

const purchaseListMock = vi.hoisted(() => vi.fn());

vi.mock('../../purchases-api/index.js', () => ({
  purchaseList: (...args: unknown[]) => purchaseListMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecentPurchasesCard', () => {
  it('queries purchases filtered by merchantEntityId', async () => {
    purchaseListMock.mockResolvedValue({ data: { items: [] }, error: undefined });

    render(<RecentPurchasesCard entityId="ent-1" />, { wrapper });

    await waitFor(() =>
      expect(purchaseListMock).toHaveBeenCalledWith({
        query: { merchantEntityId: 'ent-1', limit: 6 },
      })
    );
  });

  it('shows a plain empty state when there is simply no matching purchase', async () => {
    purchaseListMock.mockResolvedValue({ data: { items: [] }, error: undefined });

    render(<RecentPurchasesCard entityId="ent-1" />, { wrapper });

    expect(await screen.findByText('No purchases linked to this entity.')).toBeInTheDocument();
  });

  it('shows an unavailable-specific empty state when the purchases pillar cannot be reached', async () => {
    purchaseListMock.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: undefined,
    });

    render(<RecentPurchasesCard entityId="ent-1" />, { wrapper });

    expect(
      await screen.findByText('Purchases could not be reached right now.')
    ).toBeInTheDocument();
  });

  it('renders each matching purchase', async () => {
    purchaseListMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 'p1',
            checksum: 'c1',
            createdAt: '2026-08-19T00:00:00.000Z',
            currency: 'AUD',
            discountCents: 0,
            ingestMethod: 'manual',
            itemCount: 1,
            merchantEntityId: 'ent-1',
            merchantEntityName: 'Bunnings Warehouse',
            orderedAt: '2026-08-19',
            orderedAtOffsetMinutes: null,
            paymentHint: null,
            rawRef: null,
            receiptUri: null,
            settlementMode: 'card',
            shippingCents: 0,
            source: 'manual',
            sourceOrderId: null,
            status: 'settled_cash',
            subtotalCents: 12900,
            surchargeCents: 0,
            taxCents: 0,
            totalCents: 12900,
            updatedAt: '2026-08-19T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
    });

    render(<RecentPurchasesCard entityId="ent-1" />, { wrapper });

    expect(await screen.findByText('$129.00')).toBeInTheDocument();
  });
});
