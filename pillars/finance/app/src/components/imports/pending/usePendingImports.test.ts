import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockToastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }));

const navigateSpy = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateSpy,
}));

const draftsList = vi.fn();
const draftsDiscard = vi.fn();
const draftsClaim = vi.fn();
const accountsList = vi.fn();
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsList: (...args: unknown[]) => draftsList(...args),
  importDraftsDiscard: (...args: unknown[]) => draftsDiscard(...args),
  importDraftsClaim: (...args: unknown[]) => draftsClaim(...args),
  accountsList: (...args: unknown[]) => accountsList(...args),
}));

import { usePendingImports } from './usePendingImports';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  draftsList.mockResolvedValue({ data: [], error: undefined });
  accountsList.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
});

describe('usePendingImports errors', () => {
  it('toasts when discard fails, and still leaves the list settled', async () => {
    draftsDiscard.mockResolvedValue({ data: undefined, error: { message: 'boom', code: 'Bad' } });
    const { result } = renderHook(() => usePendingImports(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.discard('draft-1')).rejects.toThrow();
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('toasts when take-over fails, and does not navigate', async () => {
    draftsClaim.mockResolvedValue({ data: undefined, error: { message: 'boom', code: 'Bad' } });
    const { result } = renderHook(() => usePendingImports(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.takeOver('draft-1'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledOnce());
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
