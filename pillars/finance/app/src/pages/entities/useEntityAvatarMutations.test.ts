import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const entitiesRemoveAvatarMock = vi.hoisted(() => vi.fn());
const entitiesRerollColourMock = vi.hoisted(() => vi.fn());
const clientPutMock = vi.hoisted(() => vi.fn());

vi.mock('../../contacts-api/index.js', () => ({
  entitiesRemoveAvatar: (...args: unknown[]) => entitiesRemoveAvatarMock(...args),
  entitiesRerollColour: (...args: unknown[]) => entitiesRerollColourMock(...args),
}));

vi.mock('../../contacts-api/client.gen.js', () => ({
  client: { put: (...args: unknown[]) => clientPutMock(...args) },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useEntityAvatarMutations } from './useEntityAvatarMutations';

function apiEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    aliases: [],
    defaultTags: [],
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    avatarAssetId: 'asset-2',
    colour: '#e04667',
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEntityAvatarMutations', () => {
  it('uploads the raw file bytes via client.put, not the mistyped generated wrapper', async () => {
    clientPutMock.mockResolvedValue({
      data: { data: apiEntity(), message: 'ok' },
      error: undefined,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' });
    result.current.uploadAvatar('ent-1', file);

    await waitFor(() => expect(clientPutMock).toHaveBeenCalledTimes(1));
    const call = clientPutMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      url: '/entities/{id}/avatar',
      path: { id: 'ent-1' },
      bodySerializer: null,
      headers: { 'Content-Type': 'image/png' },
    });
    expect(call.body).toBeInstanceOf(Uint8Array);
    expect(Array.from(call.body as Uint8Array)).toEqual([1, 2, 3]);

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 'ent-1' }))
    );
  });

  it('normalizes optional contacts fields to null on the entity handed back after upload', async () => {
    clientPutMock.mockResolvedValue({
      data: { data: apiEntity({ abn: undefined, notes: undefined }), message: 'ok' },
      error: undefined,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    result.current.uploadAvatar('ent-1', new File([], 'a.png', { type: 'image/png' }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ abn: null, notes: null }))
    );
  });

  it('removes the avatar via entitiesRemoveAvatar and hands back the updated entity', async () => {
    entitiesRemoveAvatarMock.mockResolvedValue({
      data: { data: apiEntity({ avatarAssetId: null }), message: 'ok' },
      error: undefined,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    result.current.removeAvatar('ent-1');

    await waitFor(() =>
      expect(entitiesRemoveAvatarMock).toHaveBeenCalledWith({ path: { id: 'ent-1' } })
    );
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ avatarAssetId: null }))
    );
  });

  it('rerolls the colour via entitiesRerollColour and hands back the updated entity', async () => {
    entitiesRerollColourMock.mockResolvedValue({
      data: { data: apiEntity({ colour: '#009956' }), message: 'ok' },
      error: undefined,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    result.current.rerollColour('ent-1');

    await waitFor(() =>
      expect(entitiesRerollColourMock).toHaveBeenCalledWith({ path: { id: 'ent-1' } })
    );
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ colour: '#009956' }))
    );
  });
});
