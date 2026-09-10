import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const entitiesRemoveAvatarMock = vi.hoisted(() => vi.fn());
const entitiesRerollColourMock = vi.hoisted(() => vi.fn());
const entitiesUploadAvatarMock = vi.hoisted(() => vi.fn());

vi.mock('../../contacts-api/index.js', () => ({
  entitiesRemoveAvatar: (...args: unknown[]) => entitiesRemoveAvatarMock(...args),
  entitiesRerollColour: (...args: unknown[]) => entitiesRerollColourMock(...args),
  entitiesUploadAvatar: (...args: unknown[]) => entitiesUploadAvatarMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

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
  /**
   * The body must reach `fetch` as something `BodyInit` accepts. The generated
   * wrapper passes it through unserialized, so a value the spec once typed as
   * `Array<number>` would be coerced by `Request` into the string "1,2,3" and
   * stored as a three-byte "image" (POPS-3091) — hence asserting the File
   * itself is forwarded, not any array-of-bytes projection of it.
   *
   * It also used to carry a `Content-Type` override, because the spec declared
   * a media type the server refused outright. POPS-3244 made the declaration
   * true, so the override is gone and its absence is what is asserted.
   */
  it('hands the File itself to the generated upload wrapper, with no header override', async () => {
    entitiesUploadAvatarMock.mockResolvedValue({
      data: { data: apiEntity(), message: 'ok' },
      error: undefined,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' });
    result.current.uploadAvatar('ent-1', file);

    await waitFor(() => expect(entitiesUploadAvatarMock).toHaveBeenCalledTimes(1));
    const call = entitiesUploadAvatarMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({ path: { id: 'ent-1' } });
    // No `Content-Type` override. The route reads the format out of the bytes
    // now, so the wrapper's declared `application/octet-stream` is the truth
    // and the obvious call is the working one (POPS-3244). Asserted as absent
    // rather than left unmentioned: an override coming back would mean the
    // server had gone back to trusting a client-supplied label.
    expect(call.headers).toBeUndefined();
    expect(call.body).toBe(file);
    expect(Array.isArray(call.body)).toBe(false);

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 'ent-1' }))
    );
  });

  it('surfaces an upload failure as an error toast rather than a changed entity', async () => {
    entitiesUploadAvatarMock.mockResolvedValue({
      data: undefined,
      error: { message: "Unsupported content type 'image/gif'" },
      response: { status: 400 } as Response,
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEntityAvatarMutations(onChanged), {
      wrapper: makeWrapper(),
    });

    result.current.uploadAvatar('ent-1', new File([], 'a.gif', { type: 'image/gif' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Unsupported content type 'image/gif'")
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('normalizes optional contacts fields to null on the entity handed back after upload', async () => {
    entitiesUploadAvatarMock.mockResolvedValue({
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
