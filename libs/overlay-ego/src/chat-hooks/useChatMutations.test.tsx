import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '../test-utils';
import { useChatMutations } from './useChatMutations';

import type { ReactNode } from 'react';

const streaming = vi.hoisted(() => ({
  stream: vi.fn(),
  isStreaming: false,
  error: null,
  streamingContent: null,
  toolActivity: [{ name: 'inventory.search', status: 'started' }],
  streamParts: [{ type: 'text', text: 'A streamed response' }],
}));

vi.mock('./useStreamingChat', () => ({
  useStreamingChat: () => streaming,
}));

let queryClient: ReturnType<typeof createTestQueryClient>;
let currentPath = '';

function LocationProbe() {
  const pathname = useLocation().pathname;
  useEffect(() => {
    currentPath = pathname;
  }, [pathname]);
  return null;
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <LocationProbe />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

function deferred() {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function renderMutations() {
  return renderHook(
    () =>
      useChatMutations({
        selectedConversationId: 'conversation-1',
        setSelectedConversationId: vi.fn(),
        inputValue: '  hello  ',
        setInputValue: vi.fn(),
      }),
    { wrapper: Wrapper }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = createTestQueryClient();
  currentPath = '';
});

describe('useChatMutations streamed view-model data', () => {
  it('returns tool activity and streamed parts from the streaming hook', () => {
    const { result } = renderMutations();

    expect(result.current.toolActivity).toEqual(streaming.toolActivity);
    expect(result.current.streamParts).toEqual(streaming.streamParts);
  });

  it('navigates resolved stream frames through the shared URI resolver', () => {
    const { result } = renderMutations();

    act(() => result.current.sendMessage());
    const callbacks = streaming.stream.mock.calls[0]?.[1] as
      | { onNavigate?: (uri: string) => void }
      | undefined;
    expect(callbacks?.onNavigate).toBeTypeOf('function');
    if (!callbacks?.onNavigate) throw new Error('Stream navigation callback was not captured');

    act(() => callbacks.onNavigate?.('pops:media/movie/42'));

    expect(currentPath).toBe('/media/movies/42');
  });

  it('silently ignores an unresolvable stream navigation URI', () => {
    const { result } = renderMutations();

    act(() => result.current.sendMessage());
    const callbacks = streaming.stream.mock.calls[0]?.[1] as
      | { onNavigate?: (uri: string) => void }
      | undefined;
    expect(callbacks?.onNavigate).toBeTypeOf('function');
    if (!callbacks?.onNavigate) throw new Error('Stream navigation callback was not captured');

    act(() => callbacks.onNavigate?.('pops:nope/x/1'));

    expect(currentPath).toBe('/');
  });

  it('awaits both conversation invalidations after sending a message', async () => {
    const firstInvalidation = deferred();
    const secondInvalidation = deferred();
    const invalidations = [firstInvalidation, secondInvalidation];
    let invalidationIndex = 0;
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => {
      const invalidation = invalidations[invalidationIndex++];
      return invalidation?.promise ?? Promise.resolve();
    });
    const { result } = renderMutations();

    act(() => result.current.sendMessage());
    const streamCall = streaming.stream.mock.calls[0];
    expect(streamCall).toBeDefined();
    expect(streamCall?.[0]).toEqual({ conversationId: 'conversation-1', message: 'hello' });
    const callbacks = streamCall?.[1] as
      | { onInvalidate: (conversationId: string) => void | Promise<void> }
      | undefined;
    expect(callbacks).toBeDefined();
    if (!callbacks) throw new Error('Stream callbacks were not captured');

    let settled = false;
    const invalidationPromise = callbacks.onInvalidate('conversation-1');
    if (invalidationPromise) void invalidationPromise.then(() => (settled = true));

    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['ego', 'conversations', 'list'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['ego', 'conversations', 'get', { id: 'conversation-1' }],
    });
    expect(settled).toBe(false);

    firstInvalidation.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    secondInvalidation.resolve();
    await invalidationPromise;
    expect(settled).toBe(true);
  });
});
