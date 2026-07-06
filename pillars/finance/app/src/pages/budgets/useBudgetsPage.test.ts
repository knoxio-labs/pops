import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Budget } from './types';

const budgetsListMock = vi.hoisted(() => vi.fn());
const budgetsCreateMock = vi.hoisted(() => vi.fn());
const budgetsUpdateMock = vi.hoisted(() => vi.fn());
const budgetsDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  budgetsList: (...args: unknown[]) => budgetsListMock(...args),
  budgetsCreate: (...args: unknown[]) => budgetsCreateMock(...args),
  budgetsUpdate: (...args: unknown[]) => budgetsUpdateMock(...args),
  budgetsDelete: (...args: unknown[]) => budgetsDeleteMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useBudgetsPage } from './useBudgetsPage';

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    category: 'Groceries',
    period: 'Monthly',
    amount: 500,
    active: true,
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    spent: 120,
    remaining: 380,
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
  budgetsListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
  budgetsCreateMock.mockResolvedValue({ data: { data: makeBudget() }, error: undefined });
  budgetsUpdateMock.mockResolvedValue({ data: { data: makeBudget() }, error: undefined });
  budgetsDeleteMock.mockResolvedValue({ data: { success: true }, error: undefined });
});

describe('useBudgetsPage — list query', () => {
  it('issues a budgets list query with the page-size limit', async () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useBudgetsPage(), { wrapper });
    await waitFor(() =>
      expect(budgetsListMock).toHaveBeenCalledWith({ query: { limit: 500, offset: 0 } })
    );
  });

  it('exposes the unwrapped list payload', async () => {
    const budget = makeBudget({ id: 'budget-99' });
    budgetsListMock.mockResolvedValue({
      data: { data: [budget], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });
    await waitFor(() => expect(result.current.query.data?.data).toHaveLength(1));
    expect(result.current.query.data?.data[0]?.id).toBe('budget-99');
  });

  it('follows hasMore to fetch every budget beyond the first page', async () => {
    const first = makeBudget({ id: 'budget-a' });
    const second = makeBudget({ id: 'budget-b' });
    budgetsListMock
      .mockResolvedValueOnce({
        data: { data: [first], pagination: { total: 2, limit: 1, offset: 0, hasMore: true } },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: { data: [second], pagination: { total: 2, limit: 1, offset: 1, hasMore: false } },
        error: undefined,
      });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });
    await waitFor(() => expect(result.current.query.data?.data).toEqual([first, second]));
  });
});

describe('useBudgetsPage — onSubmit (create)', () => {
  it('coerces an empty period to undefined (one-time budget)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.onSubmit({
        category: 'Rent',
        period: '',
        amount: '1000',
        active: true,
        notes: '',
      });
    });

    await waitFor(() =>
      expect(budgetsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ period: undefined, amount: 1000 }),
      })
    );
    expect(budgetsUpdateMock).not.toHaveBeenCalled();
  });

  it('coerces an empty amount string to null', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.onSubmit({
        category: 'Misc',
        period: 'Monthly',
        amount: '',
        active: false,
        notes: '',
      });
    });

    await waitFor(() =>
      expect(budgetsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ amount: null }),
      })
    );
  });

  it('coerces empty notes to null', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.onSubmit({
        category: 'Groceries',
        period: 'Monthly',
        amount: '500',
        active: true,
        notes: '',
      });
    });

    await waitFor(() =>
      expect(budgetsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ notes: null }),
      })
    );
  });
});

describe('useBudgetsPage — handleEdit + onSubmit (update)', () => {
  it('handleEdit resets the form with the budget period normalized ("" for a non-Monthly/Yearly value)', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeBudget({ period: 'Weekly' as never }));
    });

    expect(result.current.form.getValues('period')).toBe('');
    expect(result.current.isDialogOpen).toBe(true);
  });

  it('handleEdit resets the form amount as a string when a numeric amount exists', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeBudget({ amount: 250 }));
    });

    expect(result.current.form.getValues('amount')).toBe('250');
  });

  it('handleEdit resets the form amount to "" when the budget has no target amount', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeBudget({ amount: null }));
    });

    expect(result.current.form.getValues('amount')).toBe('');
  });

  it('onSubmit calls budgetsUpdate with the editing budget id after handleEdit', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeBudget({ id: 'budget-edit' }));
    });
    act(() => {
      result.current.onSubmit({
        category: 'Renamed',
        period: 'Yearly',
        amount: '999',
        active: true,
        notes: '',
      });
    });

    await waitFor(() =>
      expect(budgetsUpdateMock).toHaveBeenCalledWith({
        path: { id: 'budget-edit' },
        body: expect.objectContaining({ category: 'Renamed', period: 'Yearly', amount: 999 }),
      })
    );
    expect(budgetsCreateMock).not.toHaveBeenCalled();
  });
});

describe('useBudgetsPage — delete', () => {
  it('invokes budgetsDelete with the row id and invalidates the budgets query', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBudgetsPage(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate({ id: 'budget-7' });
    });

    await waitFor(() =>
      expect(budgetsDeleteMock).toHaveBeenCalledWith({ path: { id: 'budget-7' } })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finance', 'budgets'] })
    );
  });
});
