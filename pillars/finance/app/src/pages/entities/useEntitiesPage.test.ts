import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from './types';

const entitiesCreateMock = vi.hoisted(() => vi.fn());
const entitiesUpdateMock = vi.hoisted(() => vi.fn());
const entitiesDeleteMock = vi.hoisted(() => vi.fn());
const entitiesRemoveAvatarMock = vi.hoisted(() => vi.fn());
const entitiesRerollColourMock = vi.hoisted(() => vi.fn());
const clientPutMock = vi.hoisted(() => vi.fn());
const entityUsageListMock = vi.hoisted(() => vi.fn());

vi.mock('../../contacts-api/index.js', () => ({
  entitiesCreate: (...args: unknown[]) => entitiesCreateMock(...args),
  entitiesUpdate: (...args: unknown[]) => entitiesUpdateMock(...args),
  entitiesDelete: (...args: unknown[]) => entitiesDeleteMock(...args),
  entitiesRemoveAvatar: (...args: unknown[]) => entitiesRemoveAvatarMock(...args),
  entitiesRerollColour: (...args: unknown[]) => entitiesRerollColourMock(...args),
}));

vi.mock('../../contacts-api/client.gen.js', () => ({
  client: { put: (...args: unknown[]) => clientPutMock(...args) },
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
    avatarAssetId: null,
    colour: null,
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

describe('useEntitiesPage — avatar and colour mutations', () => {
  it('uploads the avatar through the low-level client (not the generated wrapper) and updates editingEntity', async () => {
    const entity = makeEntity({ id: 'ent-avatar', avatarAssetId: null });
    clientPutMock.mockResolvedValue({
      data: { data: { ...entity, avatarAssetId: 'blob-new' } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.handleEdit(entity);
    });
    const file = new File([new Uint8Array(4)], 'logo.png', { type: 'image/png' });
    act(() => {
      result.current.uploadAvatarMutation.mutate({ id: 'ent-avatar', file });
    });

    await waitFor(() =>
      expect(clientPutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/entities/{id}/avatar',
          path: { id: 'ent-avatar' },
          body: file,
          headers: { 'Content-Type': 'image/png' },
        })
      )
    );
    await waitFor(() => expect(result.current.editingEntity?.avatarAssetId).toBe('blob-new'));
  });

  it('removes the avatar and updates editingEntity to null', async () => {
    const entity = makeEntity({ id: 'ent-avatar', avatarAssetId: 'blob-1' });
    entitiesRemoveAvatarMock.mockResolvedValue({
      data: { data: { ...entity, avatarAssetId: null } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.handleEdit(entity);
    });
    act(() => {
      result.current.removeAvatarMutation.mutate({ id: 'ent-avatar' });
    });

    await waitFor(() =>
      expect(entitiesRemoveAvatarMock).toHaveBeenCalledWith({ path: { id: 'ent-avatar' } })
    );
    await waitFor(() => expect(result.current.editingEntity?.avatarAssetId).toBeNull());
  });

  it('rerolls the colour and updates editingEntity with the fresh value', async () => {
    const entity = makeEntity({ id: 'ent-colour', colour: '#e04667' });
    entitiesRerollColourMock.mockResolvedValue({
      data: { data: { ...entity, colour: '#83b81d' } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntitiesPage(), { wrapper });

    act(() => {
      result.current.handleEdit(entity);
    });
    act(() => {
      result.current.rerollColourMutation.mutate({ id: 'ent-colour' });
    });

    await waitFor(() =>
      expect(entitiesRerollColourMock).toHaveBeenCalledWith({ path: { id: 'ent-colour' } })
    );
    await waitFor(() => expect(result.current.editingEntity?.colour).toBe('#83b81d'));
  });
});
