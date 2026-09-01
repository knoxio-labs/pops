import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastError, libraryAddMovie, discoveryDismiss } = vi.hoisted(() => ({
  toastError: vi.fn(),
  libraryAddMovie: vi.fn(),
  discoveryDismiss: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn() },
}));

vi.mock('../../media-api/index.js', () => ({
  libraryAddMovie: (...args: unknown[]) => libraryAddMovie(...args),
  discoveryDismiss: (...args: unknown[]) => discoveryDismiss(...args),
  watchlistAdd: vi.fn(),
  watchlistRemove: vi.fn(),
  watchlistStatus: vi.fn(),
  watchHistoryLog: vi.fn(),
}));

import { MediaApiError } from '../../media-api-helpers.js';
import { useDiscoverMutations } from './discoverMutations';
import { useAddToLibrary, useNotInterested } from './handlers';
import { usePendingSet } from './usePendingSet';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderAddToLibrary() {
  return renderHook(
    () => {
      const mutations = useDiscoverMutations();
      const pending = usePendingSet();
      const queryClient = new QueryClient();
      return { run: useAddToLibrary({ mutations, queryClient, pending }), pending };
    },
    { wrapper }
  );
}

function failure(status: number, message: string) {
  return { error: { message }, response: new Response(null, { status }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('discover action error toasts', () => {
  it('distinguishes an unavailable pillar from a missing entity', async () => {
    const { result } = renderAddToLibrary();

    libraryAddMovie.mockResolvedValueOnce(failure(500, 'boom'));
    expect(await result.current.run(11)).toEqual({ ok: false });
    const serverErrorToast = toastError.mock.calls.at(-1)?.[0] as string;

    libraryAddMovie.mockResolvedValueOnce(failure(404, 'no such movie'));
    expect(await result.current.run(11)).toEqual({ ok: false });
    const notFoundToast = toastError.mock.calls.at(-1)?.[0] as string;

    expect(serverErrorToast).toContain('Failed to add to library');
    expect(notFoundToast).toContain('Failed to add to library');
    expect(serverErrorToast).not.toEqual(notFoundToast);
    expect(serverErrorToast).toMatch(/unavailable/i);
    expect(notFoundToast).toMatch(/not found/i);
  });

  it('logs the raw error to the console for browser-side triage', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderAddToLibrary();
    libraryAddMovie.mockResolvedValueOnce(failure(500, 'boom'));

    await result.current.run(11);

    const [, logged] =
      consoleError.mock.calls.find(
        ([label]) => label === 'discover action failed: add to library'
      ) ?? [];
    expect(logged).toBeInstanceOf(MediaApiError);
    expect((logged as MediaApiError).status).toBe(500);
    consoleError.mockRestore();
  });

  it('surfaces the server message and status for other failures', async () => {
    const { result } = renderAddToLibrary();
    libraryAddMovie.mockResolvedValueOnce(failure(422, 'tmdbId must be positive'));

    await result.current.run(-1);

    expect(toastError).toHaveBeenCalledWith(
      'Failed to add to library: tmdbId must be positive (HTTP 422)'
    );
  });

  it('reports a transport failure with no HTTP status as unavailable', async () => {
    const { result } = renderAddToLibrary();
    libraryAddMovie.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });

    await result.current.run(11);

    expect(toastError).toHaveBeenCalledWith(
      'Failed to add to library: the media service is unavailable'
    );
  });

  it('clears the optimistic dismissal and names the failure', async () => {
    const { result } = renderHook(
      () => {
        const mutations = useDiscoverMutations();
        const dismissing = usePendingSet();
        const optimistic = usePendingSet();
        const queryClient = new QueryClient();
        return {
          run: useNotInterested({ mutations, queryClient, dismissing, optimistic }),
          optimistic,
          dismissing,
        };
      },
      { wrapper }
    );
    discoveryDismiss.mockResolvedValueOnce(failure(503, 'upstream down'));

    expect(await result.current.run(7)).toEqual({ ok: false });

    expect(result.current.optimistic.set.has(7)).toBe(false);
    expect(result.current.dismissing.set.has(7)).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Failed to dismiss: the media service is unavailable');
  });
});
