import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityDetailPage } from './useEntityDetailPage';

const entitiesGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../contacts-api/index.js', () => ({
  entitiesGet: (...args: unknown[]) => entitiesGetMock(...args),
}));
vi.mock('../../contacts-api/client.gen.js', () => ({
  client: { put: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
});

describe('useEntityDetailPage', () => {
  it('fetches the entity by id from contacts', async () => {
    entitiesGetMock.mockResolvedValue({
      data: {
        data: {
          id: 'ent-1',
          name: 'Woolworths',
          type: 'company',
          aliases: [],
          defaultTags: [],
          lastEditedTime: '2026-01-01T00:00:00.000Z',
        },
      },
      error: undefined,
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useEntityDetailPage('ent-1'), { wrapper });

    await waitFor(() => expect(result.current.entity?.name).toBe('Woolworths'));
    expect(entitiesGetMock).toHaveBeenCalledWith({ path: { id: 'ent-1' } });
  });

  it('openEdit pre-fills the dialog from the fetched entity, matching handleEdit prefill', async () => {
    entitiesGetMock.mockResolvedValue({
      data: {
        data: {
          id: 'ent-1',
          name: 'Bunnings Warehouse',
          type: 'company',
          abn: '26 008 672 179',
          aliases: ['Bunnings'],
          defaultTags: [],
          lastEditedTime: '2026-01-01T00:00:00.000Z',
          avatarAssetId: 'asset-1',
          colour: '#0d5257',
        },
      },
      error: undefined,
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useEntityDetailPage('ent-1'), { wrapper });
    await waitFor(() => expect(result.current.entity).not.toBeNull());

    act(() => {
      result.current.openEdit();
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.editingEntity?.id).toBe('ent-1');
    expect(result.current.form.getValues('name')).toBe('Bunnings Warehouse');
    expect(result.current.form.getValues('abn')).toBe('26 008 672 179');
    expect(result.current.form.getValues('aliases')).toEqual(['Bunnings']);
  });

  it('does nothing when openEdit is called before the entity has loaded', () => {
    entitiesGetMock.mockReturnValue(new Promise(() => undefined));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useEntityDetailPage('ent-1'), { wrapper });

    act(() => {
      result.current.openEdit();
    });

    expect(result.current.isDialogOpen).toBe(false);
  });
});
