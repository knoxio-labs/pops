import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Currency } from './types';

const currenciesListMock = vi.hoisted(() => vi.fn());
const currenciesUpdateMock = vi.hoisted(() => vi.fn());
const currenciesDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  currenciesList: (...args: unknown[]) => currenciesListMock(...args),
  currenciesUpdate: (...args: unknown[]) => currenciesUpdateMock(...args),
  currenciesDelete: (...args: unknown[]) => currenciesDeleteMock(...args),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { useCurrenciesSettings } from './useCurrenciesSettings';

function makeCurrency(overrides: Partial<Currency> = {}): Currency {
  return {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: '$',
    decimals: 2,
    kind: 'fiat',
    createdAt: '2026-01-01T00:00:00.000Z',
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
  currenciesListMock.mockResolvedValue({ data: { data: [] }, error: undefined });
  currenciesUpdateMock.mockResolvedValue({
    data: { data: makeCurrency(), message: 'Currency updated' },
    error: undefined,
  });
  currenciesDeleteMock.mockResolvedValue({
    data: { message: 'Currency deleted' },
    error: undefined,
  });
});

describe('useCurrenciesSettings — edit', () => {
  it('calls currenciesUpdate with the editing code and coerced form values, invalidates the list, and toasts success', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCurrenciesSettings(), { wrapper });

    act(() => {
      result.current.handleEdit(makeCurrency({ code: 'CAD', name: 'Canadian Dollar' }));
    });
    act(() => {
      result.current.onSubmit({ name: 'Loonie', symbol: 'C$', decimals: '0', kind: 'points' });
    });

    await waitFor(() =>
      expect(currenciesUpdateMock).toHaveBeenCalledWith({
        path: { code: 'CAD' },
        body: { name: 'Loonie', symbol: 'C$', decimals: 0, kind: 'points' },
      })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finance', 'currencies', 'list'] })
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Currency updated'));
  });

  it('coerces an empty symbol to null', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrenciesSettings(), { wrapper });

    act(() => {
      result.current.handleEdit(makeCurrency());
    });
    act(() => {
      result.current.onSubmit({ name: 'Points', symbol: '', decimals: '0', kind: 'points' });
    });

    await waitFor(() =>
      expect(currenciesUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ symbol: null }) })
      )
    );
  });

  it('does nothing when onSubmit is called with no currency being edited', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrenciesSettings(), { wrapper });

    act(() => {
      result.current.onSubmit({ name: 'X', symbol: '', decimals: '0', kind: 'fiat' });
    });

    expect(currenciesUpdateMock).not.toHaveBeenCalled();
  });
});

describe('useCurrenciesSettings — delete', () => {
  it('surfaces a 409 conflict message from the server (via unwrap/FinanceApiError) as a toast', async () => {
    currenciesDeleteMock.mockResolvedValue({
      data: undefined,
      error: { message: "Currency 'AUD' is in use and cannot be deleted" },
      response: { status: 409 },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrenciesSettings(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate('AUD');
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Currency 'AUD' is in use and cannot be deleted")
    );
  });

  it('surfaces a decimals-in-use 409 conflict from an update as a toast, distinct from the delete conflict', async () => {
    currenciesUpdateMock.mockResolvedValue({
      data: undefined,
      error: { message: "Currency 'AUD' is in use — its decimals cannot be changed" },
      response: { status: 409 },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrenciesSettings(), { wrapper });

    act(() => {
      result.current.handleEdit(makeCurrency());
    });
    act(() => {
      result.current.onSubmit({
        name: 'Australian Dollar',
        symbol: '$',
        decimals: '3',
        kind: 'fiat',
      });
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Currency 'AUD' is in use — its decimals cannot be changed"
      )
    );
  });
});
