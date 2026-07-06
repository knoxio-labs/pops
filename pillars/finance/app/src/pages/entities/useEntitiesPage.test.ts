import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from './types';

const entitiesCreateMock = vi.hoisted(() => vi.fn());
const entitiesUpdateMock = vi.hoisted(() => vi.fn());
const entitiesDeleteMock = vi.hoisted(() => vi.fn());
const entityUsageListMock = vi.hoisted(() => vi.fn());

vi.mock('../../contacts-api/index.js', () => ({
  entitiesCreate: (...args: unknown[]) => entitiesCreateMock(...args),
  entitiesUpdate: (...args: unknown[]) => entitiesUpdateMock(...args),
  entitiesDelete: (...args: unknown[]) => entitiesDeleteMock(...args),
}));

vi.mock('../../finance-api/index.js', () => ({
  entityUsageList: (...args: unknown[]) => entityUsageListMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useEntitiesPage } from './useEntitiesPage';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    transactionCount: 3,
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
  entityUsageListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  });
  entitiesCreateMock.mockResolvedValue({ data: { data: makeEntity() }, error: undefined });
  entitiesUpdateMock.mockResolvedValue({ data: { data: makeEntity() }, error: undefined });
  entitiesDeleteMock.mockResolvedValue({ data: { success: true }, error: undefined });
});

describe('useEntitiesPage — list query', () => {
  it('issues an entity-usage list query with no orphanedOnly filter by default', async () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useEntitiesPage(), { wrapper });
    await waitFor(() =>
      expect(entityUsageListMock).toHaveBeenCalledWith({
        query: { limit: 500, offset: 0, orphanedOnly: undefined },
      })
    );
  });

  it('adds the orphanedOnly filter once toggled on', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.setShowOrphanedOnly(true);
    });

    await waitFor(() =>
      expect(entityUsageListMock).toHaveBeenCalledWith({
        query: { limit: 500, offset: 0, orphanedOnly: 'true' },
      })
    );
  });

  it('exposes the unwrapped list payload', async () => {
    const entity = makeEntity({ id: 'ent-99' });
    entityUsageListMock.mockResolvedValue({
      data: { data: [entity], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });
    await waitFor(() => expect(result.current.query.data?.data).toHaveLength(1));
    expect(result.current.query.data?.data[0]?.id).toBe('ent-99');
  });

  it('follows hasMore to fetch every entity beyond the first page', async () => {
    const first = makeEntity({ id: 'ent-a' });
    const second = makeEntity({ id: 'ent-b' });
    entityUsageListMock
      .mockResolvedValueOnce({
        data: { data: [first], pagination: { total: 2, limit: 1, offset: 0, hasMore: true } },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: { data: [second], pagination: { total: 2, limit: 1, offset: 1, hasMore: false } },
        error: undefined,
      });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });
    await waitFor(() => expect(result.current.query.data?.data).toEqual([first, second]));
  });
});

describe('useEntitiesPage — add/edit form wiring', () => {
  it('handleAdd opens the dialog with no editing entity and reset default values', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.handleAdd();
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.editingEntity).toBeNull();
    expect(result.current.form.getValues('name')).toBe('');
  });

  it('handleEdit opens the dialog pre-filled from the given entity', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });
    const entity = makeEntity({ name: 'Coles', abn: '123', aliases: ['Coles Express'] });

    act(() => {
      result.current.handleEdit(entity);
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.editingEntity).toEqual(entity);
    expect(result.current.form.getValues('name')).toBe('Coles');
    expect(result.current.form.getValues('abn')).toBe('123');
    expect(result.current.form.getValues('aliases')).toEqual(['Coles Express']);
  });

  it('onSubmit calls entitiesCreate when there is no editing entity', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.onSubmit({
        name: 'New Corp',
        type: 'company',
        abn: '',
        aliases: [],
        defaultTransactionType: '',
        defaultTags: [],
        notes: '',
      });
    });

    await waitFor(() =>
      expect(entitiesCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ name: 'New Corp', abn: null }),
      })
    );
    expect(entitiesUpdateMock).not.toHaveBeenCalled();
  });

  it('onSubmit calls entitiesUpdate with the editing entity id after handleEdit', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeEntity({ id: 'ent-edit' }));
    });
    act(() => {
      result.current.onSubmit({
        name: 'Renamed Corp',
        type: 'company',
        abn: '',
        aliases: [],
        defaultTransactionType: '',
        defaultTags: [],
        notes: '',
      });
    });

    await waitFor(() =>
      expect(entitiesUpdateMock).toHaveBeenCalledWith({
        path: { id: 'ent-edit' },
        body: expect.objectContaining({ name: 'Renamed Corp' }),
      })
    );
    expect(entitiesCreateMock).not.toHaveBeenCalled();
  });
});

describe('useEntitiesPage — delete', () => {
  it('invokes entitiesDelete with the row id and invalidates the entities query', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate({ id: 'ent-7' });
    });

    await waitFor(() => expect(entitiesDeleteMock).toHaveBeenCalledWith({ path: { id: 'ent-7' } }));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contacts', 'entities'] })
    );
  });
});
