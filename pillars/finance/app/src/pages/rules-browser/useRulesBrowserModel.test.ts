import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Correction } from './types';

const correctionsListMock = vi.hoisted(() => vi.fn());
const correctionsDeleteMock = vi.hoisted(() => vi.fn());
const entitiesListMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  correctionsList: (...args: unknown[]) => correctionsListMock(...args),
  correctionsDelete: (...args: unknown[]) => correctionsDeleteMock(...args),
  correctionsCreateOrUpdate: vi.fn(),
  correctionsUpdate: vi.fn(),
}));

vi.mock('../../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => entitiesListMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PAGE_SIZE, useRulesBrowserModel } from './useRulesBrowserModel';

function makeCorrection(overrides: Partial<Correction> = {}): Correction {
  return {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'exact',
    entityId: 'entity-1',
    entityName: 'Woolworths',
    location: null,
    tags: [],
    transactionType: 'purchase',
    isActive: true,
    confidence: 0.95,
    timesApplied: 10,
    priority: 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastUsedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  entitiesListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
  correctionsDeleteMock.mockResolvedValue({ data: { success: true }, error: undefined });
});

describe('useRulesBrowserModel — offset reset on delete (CF084/#3670)', () => {
  it('resets the offset back a page when a delete empties the last page', async () => {
    const { wrapper } = makeWrapper();

    correctionsListMock.mockResolvedValue({
      data: {
        data: [makeCorrection({ id: 'only-rule-on-page-2' })],
        pagination: { total: PAGE_SIZE + 1, limit: PAGE_SIZE, offset: PAGE_SIZE },
      },
      error: undefined,
    });

    const { result } = renderHook(() => useRulesBrowserModel(), { wrapper });

    act(() => {
      result.current.setOffset(PAGE_SIZE);
    });
    await waitFor(() => expect(result.current.offset).toBe(PAGE_SIZE));
    await waitFor(() => expect(result.current.corrections).toHaveLength(1));

    // The delete removes the only rule on page 2 — the server now reports a
    // total that no longer covers the current offset.
    correctionsListMock.mockResolvedValue({
      data: { data: [], pagination: { total: PAGE_SIZE, limit: PAGE_SIZE, offset: PAGE_SIZE } },
      error: undefined,
    });

    act(() => {
      result.current.setDeleteId('only-rule-on-page-2');
    });
    act(() => {
      result.current.handleDelete();
    });

    await waitFor(() => expect(correctionsDeleteMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it('does not touch the offset while the current page still has rows', async () => {
    const { wrapper } = makeWrapper();
    correctionsListMock.mockResolvedValue({
      data: {
        data: [makeCorrection()],
        pagination: { total: PAGE_SIZE + 5, limit: PAGE_SIZE, offset: PAGE_SIZE },
      },
      error: undefined,
    });

    const { result } = renderHook(() => useRulesBrowserModel(), { wrapper });
    act(() => {
      result.current.setOffset(PAGE_SIZE);
    });

    await waitFor(() => expect(result.current.corrections).toHaveLength(1));
    expect(result.current.offset).toBe(PAGE_SIZE);
  });
});
