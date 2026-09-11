import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reconcileLinksMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so paging, `unwrap` and
 * the unavailability classification all run for real. A test that stubbed a
 * fetch-all helper would only prove the helper calls itself.
 */
vi.mock('../../../purchases-api/index.js', () => ({
  reconcileLinks: (...args: unknown[]) => reconcileLinksMock(...args),
}));

import { LINKS_PAGE_SIZE, usePurchasesForTransaction } from './usePurchasesForTransaction';

import type { LinkedPurchase } from './types';

function order(id: string): LinkedPurchase {
  return {
    charges: [
      {
        charge: {
          amountCents: 100,
          chargedAt: '2026-03-05T00:00:00.000Z',
          createdAt: '2026-03-05T00:00:00.000Z',
          currency: 'AUD',
          id: `chg-${id}`,
          orderAmountCents: 100,
          origin: 'merchant',
          paymentHint: null,
          position: 0,
          purchaseId: id,
          role: 'capture',
          shipmentId: null,
          sourceChargeRef: null,
          updatedAt: '2026-03-05T00:00:00.000Z',
        },
        link: {
          amountCents: 100,
          chargeId: `chg-${id}`,
          confidence: 0.9,
          confirmedAt: null,
          createdAt: '2026-03-06T00:00:00.000Z',
          id: `lnk-${id}`,
          linkType: 'exact',
          matchRuleId: null,
          transactionUri: 'pops://finance/transaction/tx-1',
        },
      },
    ],
    linkedCents: 100,
    purchase: {
      checksum: `sha256-${id}`,
      createdAt: '2026-03-05T00:00:00.000Z',
      currency: 'AUD',
      discountCents: 0,
      id,
      ingestMethod: 'export',
      merchantEntityId: null,
      merchantEntityName: 'Amazon',
      orderedAt: '2026-03-04T00:00:00.000Z',
      orderedAtOffsetMinutes: null,
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      source: 'amazon-dsar',
      sourceOrderId: `ORD-${id}`,
      status: 'linked',
      subtotalCents: 100,
      surchargeCents: 0,
      taxCents: 0,
      totalCents: 100,
      updatedAt: '2026-03-05T00:00:00.000Z',
    },
  };
}

function page(purchases: LinkedPurchase[]) {
  return {
    data: { purchases, transactionUri: 'pops://finance/transaction/tx-1' },
    error: undefined,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  reconcileLinksMock.mockReset();
});

describe('usePurchasesForTransaction', () => {
  it('makes exactly one request for a single short page', async () => {
    reconcileLinksMock.mockResolvedValue(page([order('order-1')]));

    const { result } = renderHook(() => usePurchasesForTransaction('tx-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(reconcileLinksMock).toHaveBeenCalledTimes(1);
    expect(reconcileLinksMock).toHaveBeenCalledWith({
      query: {
        transactionUri: 'pops://finance/transaction/tx-1',
        limit: LINKS_PAGE_SIZE,
        offset: 0,
      },
    });
  });

  it('walks every page of a transaction that settled more than one page of orders', async () => {
    const firstPage = Array.from({ length: LINKS_PAGE_SIZE }, (_, index) =>
      order(`order-${index}`)
    );
    const secondPage = [order('order-extra-1'), order('order-extra-2'), order('order-extra-3')];
    reconcileLinksMock
      .mockResolvedValueOnce(page(firstPage))
      .mockResolvedValueOnce(page(secondPage));

    const { result } = renderHook(() => usePurchasesForTransaction('tx-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(result.current.entries).toHaveLength(LINKS_PAGE_SIZE + secondPage.length)
    );
    expect(reconcileLinksMock).toHaveBeenCalledTimes(2);
    expect(reconcileLinksMock).toHaveBeenNthCalledWith(1, {
      query: {
        transactionUri: 'pops://finance/transaction/tx-1',
        limit: LINKS_PAGE_SIZE,
        offset: 0,
      },
    });
    expect(reconcileLinksMock).toHaveBeenNthCalledWith(2, {
      query: {
        transactionUri: 'pops://finance/transaction/tx-1',
        limit: LINKS_PAGE_SIZE,
        offset: LINKS_PAGE_SIZE,
      },
    });
    expect(result.current.entries.map((entry) => entry.purchase.id)).toEqual([
      ...firstPage.map((entry) => entry.purchase.id),
      ...secondPage.map((entry) => entry.purchase.id),
    ]);
  });

  it("surfaces a second page's error exactly as a single-request failure would", async () => {
    const firstPage = Array.from({ length: LINKS_PAGE_SIZE }, (_, index) =>
      order(`order-${index}`)
    );
    reconcileLinksMock.mockResolvedValueOnce(page(firstPage)).mockResolvedValueOnce({
      data: undefined,
      error: { message: 'upstream unreachable' },
      response: { status: 503 },
    });

    const { result } = renderHook(() => usePurchasesForTransaction('tx-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.entries).toHaveLength(0);
  });
});
