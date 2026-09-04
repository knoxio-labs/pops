import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Institution } from './types';

const institutionsListMock = vi.hoisted(() => vi.fn());
const institutionsUpdateMock = vi.hoisted(() => vi.fn());
const institutionsDeleteMock = vi.hoisted(() => vi.fn());
const institutionsMergeMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  institutionsList: (...args: unknown[]) => institutionsListMock(...args),
  institutionsUpdate: (...args: unknown[]) => institutionsUpdateMock(...args),
  institutionsDelete: (...args: unknown[]) => institutionsDeleteMock(...args),
  institutionsMerge: (...args: unknown[]) => institutionsMergeMock(...args),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { useInstitutionsSettings } from './useInstitutionsSettings';

function makeInstitution(overrides: Partial<Institution> = {}): Institution {
  return {
    id: 'inst-1',
    name: 'Westpac',
    colour: '#d5001c',
    logoAssetId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
  institutionsListMock.mockResolvedValue({ data: { data: [] }, error: undefined });
  institutionsUpdateMock.mockResolvedValue({
    data: { data: makeInstitution(), message: 'Institution updated' },
    error: undefined,
  });
  institutionsDeleteMock.mockResolvedValue({
    data: { message: 'Institution deleted' },
    error: undefined,
  });
  institutionsMergeMock.mockResolvedValue({
    data: { data: makeInstitution(), message: 'Institutions merged' },
    error: undefined,
  });
});

describe('useInstitutionsSettings — edit', () => {
  it('calls institutionsUpdate with the editing id and form values, invalidates the list, and toasts success', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.handleEdit(makeInstitution({ id: 'inst-42', name: 'ANZ' }));
    });
    act(() => {
      result.current.onSubmit({ name: 'ANZ Bank', colour: '#000000' });
    });

    await waitFor(() =>
      expect(institutionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 'inst-42' },
        body: { name: 'ANZ Bank', colour: '#000000' },
      })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['finance', 'institutions', 'list'],
      })
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Institution updated'));
  });

  it('does nothing when onSubmit is called with no institution being edited', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.onSubmit({ name: 'X', colour: '#000000' });
    });

    expect(institutionsUpdateMock).not.toHaveBeenCalled();
  });
});

describe('useInstitutionsSettings — delete', () => {
  it('surfaces a 409 conflict message from the server (via unwrap/FinanceApiError) as a toast', async () => {
    institutionsDeleteMock.mockResolvedValue({
      data: undefined,
      error: { message: "Institution 'inst-1' is in use and cannot be deleted" },
      response: { status: 409 },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate('inst-1');
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Institution 'inst-1' is in use and cannot be deleted"
      )
    );
  });

  it('invalidates the list and toasts success on a successful delete', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate('inst-1');
    });

    await waitFor(() =>
      expect(institutionsDeleteMock).toHaveBeenCalledWith({ path: { id: 'inst-1' } })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['finance', 'institutions', 'list'],
      })
    );
    expect(toastSuccess).toHaveBeenCalledWith('Institution deleted');
  });
});

describe('useInstitutionsSettings — merge', () => {
  it('calls institutionsMerge with the merging id and picked targetId, invalidates the list, and toasts success', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.setMerging(makeInstitution({ id: 'inst-source', name: 'A.N.Z.' }));
    });
    act(() => {
      result.current.onMerge('inst-target');
    });

    await waitFor(() =>
      expect(institutionsMergeMock).toHaveBeenCalledWith({
        path: { id: 'inst-source' },
        body: { targetId: 'inst-target' },
      })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['finance', 'institutions', 'list'],
      })
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Institutions merged'));
  });

  it('does nothing when onMerge is called with no institution being merged', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.onMerge('inst-target');
    });

    expect(institutionsMergeMock).not.toHaveBeenCalled();
  });

  it('surfaces a 422 same-institution refusal from the server as a toast', async () => {
    institutionsMergeMock.mockResolvedValue({
      data: undefined,
      error: { message: "Institution 'inst-1' cannot be merged into itself" },
      response: { status: 422 },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useInstitutionsSettings(), { wrapper });

    act(() => {
      result.current.setMerging(makeInstitution({ id: 'inst-1' }));
    });
    act(() => {
      result.current.onMerge('inst-1');
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Institution 'inst-1' cannot be merged into itself")
    );
  });
});
