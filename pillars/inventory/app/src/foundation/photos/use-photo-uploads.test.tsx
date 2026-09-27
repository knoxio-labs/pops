import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhotoUploads } from './use-photo-uploads';

import type { ReactNode } from 'react';

import type {
  InventoryCommandInput,
  InventoryMutationOutcome,
} from '../../inventory-web/mutation-client.js';

type ProcessedPhoto = { readonly processed: Blob };

const mocks = vi.hoisted(() => ({
  processFiles: vi.fn<(files: File[]) => Promise<ProcessedPhoto[]>>(),
  sendInventoryMutation:
    vi.fn<(input: InventoryCommandInput) => Promise<InventoryMutationOutcome>>(),
}));

vi.mock('../../hooks/useImageProcessor', () => ({
  useImageProcessor: () => ({ processFiles: mocks.processFiles, processing: false }),
}));

vi.mock('../../inventory-web/mutation-client.js', () => ({
  sendInventoryMutation: (input: InventoryCommandInput) => mocks.sendInventoryMutation(input),
}));

class FakeXMLHttpRequest {
  static readonly instances: FakeXMLHttpRequest[] = [];

  readonly upload: {
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null;
  } = { onprogress: null };
  readonly headers = new Map<string, string>();
  method = '';
  url = '';
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  send(): void {
    this.status = 201;
    this.onload?.();
  }
}

function wrapper({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function photo(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function applied(seq: number): InventoryMutationOutcome {
  return {
    converged: true,
    mutationId: `mutation-${String(seq)}`,
    revision: seq,
    seq,
    status: 'applied',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeXMLHttpRequest.instances.length = 0;
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  mocks.processFiles.mockImplementation(async (files) =>
    files.map((file) => ({ processed: new Blob([file], { type: 'image/jpeg' }) }))
  );
  mocks.sendInventoryMutation.mockResolvedValue(applied(1));
});

describe('usePhotoUploads', () => {
  it('stages create photos and attaches them after save', async () => {
    const { result } = renderHook(() => usePhotoUploads('create', null, 0), { wrapper });

    act(() => result.current.add([photo('lamp.png')]));
    expect(result.current.queue[0]?.status).toEqual({ kind: 'staged' });

    let flushed: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      flushed = await result.current.flush('item-1');
    });

    expect(flushed?.attached).toBe(1);
    expect(result.current.queue[0]?.status).toEqual({ kind: 'attached' });
    expect(mocks.sendInventoryMutation).toHaveBeenCalledWith({
      command: {
        op: 'item.attachPhoto',
        args: { sha256: expect.any(String), position: 0 },
      },
      entityId: 'item-1',
    });
  });

  it('keeps a failed upload in the queue so it can be retried', async () => {
    mocks.processFiles.mockRejectedValueOnce(new Error('decode failed'));
    const { result } = renderHook(() => usePhotoUploads('edit', 'item-3', 0), { wrapper });

    act(() => result.current.add([photo('broken.png')]));
    await waitFor(() => expect(result.current.queue[0]?.status.kind).toBe('failed'));
    expect(result.current.queue[0]?.status).toEqual({
      kind: 'failed',
      reason: 'the photo could not be read',
    });

    act(() => {
      const localId = result.current.queue[0]?.localId;
      if (localId !== undefined) result.current.retry(localId);
    });
    await waitFor(() => expect(result.current.queue[0]?.status.kind).toBe('attached'));
    expect(mocks.sendInventoryMutation).toHaveBeenCalledTimes(1);
  });
});
