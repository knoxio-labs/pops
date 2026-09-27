import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils.js';
import { useRepairPhotoUploads } from './use-repair-photo-uploads.js';

import type { PhotosUploadResponse } from '../../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ photosUpload: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({
  photosUpload: (...args: unknown[]) => mocks.photosUpload(...args),
}));

function photo(name: string, type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function uploadedPhoto(): {
  data: PhotosUploadResponse;
  error: undefined;
  response: { status: 201 };
} {
  return {
    data: {
      data: {
        caption: null,
        createdAt: '2026-09-28T00:00:00Z',
        filePath: '2026/09/photo.png',
        id: 1,
        itemId: 'item-1',
        sortOrder: 2,
      },
      message: 'uploaded',
    },
    error: undefined,
    response: { status: 201 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.photosUpload.mockResolvedValue(uploadedPhoto());
});

describe('useRepairPhotoUploads', () => {
  it('uploads valid files while returning refused files in their original positions', async () => {
    const { result } = renderHook(() => useRepairPhotoUploads('item-1', 2), {
      wrapper: withQueryClient(createTestQueryClient()),
    });
    let outcomes: Awaited<ReturnType<typeof result.current.add>> | undefined;

    await act(async () => {
      outcomes = await result.current.add([photo('good.png'), photo('bad.txt', 'text/plain')]);
    });

    expect(outcomes).toEqual([
      { fileName: 'good.png', status: 'attached' },
      { fileName: 'bad.txt', status: 'refused', reason: 'bad.txt is not an image.' },
    ]);
    expect(mocks.photosUpload).toHaveBeenCalledTimes(1);
    expect(mocks.photosUpload).toHaveBeenCalledWith({
      path: { itemId: 'item-1' },
      body: { fileBase64: expect.any(String), sortOrder: 2 },
    });
    await waitFor(() => expect(result.current.queue[0]?.status).toBe('attached'));
    expect(result.current.refused).toEqual(['bad.txt is not an image.']);
  });
});
