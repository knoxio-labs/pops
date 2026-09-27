import { useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { unwrap } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import {
  PAPERLESS_STATUS_QUERY_KEY,
  usePaperlessState,
  usePaperlessStatus,
} from './usePaperlessStatus';

import type { PaperlessStatusResponse } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ paperlessStatus: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  paperlessStatus: (...args: unknown[]) => mocks.paperlessStatus(...args),
}));

const state: PaperlessStatusResponse['data'] = {
  available: true,
  baseUrl: 'https://paperless.example',
  configured: true,
  documentCount: 4,
};

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

type PaperlessEnvelopeResponse = ReturnType<typeof ok<{ data: PaperlessStatusResponse['data'] }>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePaperlessStatus', () => {
  it('caches the data envelope under the paperless status key and selects data', async () => {
    mocks.paperlessStatus.mockResolvedValue(ok({ data: state }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePaperlessStatus(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(state);
    expect(client.getQueryData(PAPERLESS_STATUS_QUERY_KEY)).toEqual({ data: state });
  });

  it('shares one request with a reader of the same key that caches the envelope', async () => {
    mocks.paperlessStatus.mockResolvedValue(ok({ data: state }));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => ({
        selected: usePaperlessStatus(),
        raw: useQuery({
          queryKey: PAPERLESS_STATUS_QUERY_KEY,
          queryFn: async () => unwrap(await mocks.paperlessStatus()),
        }),
      }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.selected.isSuccess).toBe(true));

    expect(mocks.paperlessStatus).toHaveBeenCalledOnce();
    expect(result.current.raw.data).toEqual({ data: state });
    expect(client.getQueryData(PAPERLESS_STATUS_QUERY_KEY)).toEqual({ data: state });
  });

  it('usePaperlessState reads available, configured and baseUrl, and is null until loaded', async () => {
    let resolve: ((value: PaperlessEnvelopeResponse) => void) | undefined;
    const pending = new Promise<PaperlessEnvelopeResponse>((resolver) => {
      resolve = resolver;
    });
    mocks.paperlessStatus.mockReturnValue(pending);
    const { result } = renderHook(() => usePaperlessState(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    expect(result.current).toBeNull();
    resolve?.(ok({ data: state }));

    await waitFor(() =>
      expect(result.current).toEqual({
        available: true,
        configured: true,
        baseUrl: 'https://paperless.example',
      })
    );
  });
});
