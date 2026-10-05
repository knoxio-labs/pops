import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '../test-utils';
import { useChatMutations } from './useChatMutations';

import type { ReactNode } from 'react';

import type { ChatMessage } from './types';

const streaming = vi.hoisted(() => ({
  stream: vi.fn(),
  isStreaming: false,
  error: null,
  streamingContent: null,
  toolActivity: [{ name: 'inventory.search', status: 'started' }],
  streamParts: [{ type: 'text', text: 'A streamed response' }],
}));

const api = vi.hoisted(() => ({ egoDecideActionBatch: vi.fn(), egoDeleteConversation: vi.fn() }));

vi.mock('./useStreamingChat', () => ({
  useStreamingChat: () => streaming,
}));

vi.mock('../ego-api', () => api);

let queryClient: ReturnType<typeof createTestQueryClient>;
let currentPath = '';
const setSelectedConversationId = vi.fn();
const setInputValue = vi.fn();

const decision = {
  approve: ['a1', 'a3'],
  reject: ['a2'],
  alwaysAllow: ['inventory.items.move'],
};

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

function deferredValue<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderMutations(messages: ChatMessage[] = []) {
  return renderHook(
    () =>
      useChatMutations({
        selectedConversationId: 'conversation-1',
        setSelectedConversationId,
        inputValue: '  hello  ',
        messages,
        setInputValue,
      }),
    { wrapper: Wrapper }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = createTestQueryClient();
  currentPath = '';
  api.egoDecideActionBatch.mockReset().mockResolvedValue({ data: {} });
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

  it('resumes after a successful decision with the same stream callbacks as messages', async () => {
    const { result } = renderMutations();

    act(() => result.current.sendMessage());
    const messageCall = streaming.stream.mock.calls[0];
    const messageCallbacks = messageCall?.[1] as Record<string, unknown> | undefined;
    expect(messageCall?.[0]).toEqual({ conversationId: 'conversation-1', message: 'hello' });
    expect(messageCallbacks).toEqual({
      onConversation: expect.any(Function),
      onEngrams: expect.any(Function),
      onInvalidate: expect.any(Function),
      onNavigate: expect.any(Function),
    });

    streaming.stream.mockClear();
    const batchDecisions = result.current.batchDecisions;
    expect(batchDecisions).not.toBeNull();
    await act(async () => {
      await batchDecisions?.decide('b1', decision);
    });

    expect(api.egoDecideActionBatch).toHaveBeenCalledOnce();
    expect(api.egoDecideActionBatch).toHaveBeenCalledWith({
      path: { batchId: 'b1' },
      body: decision,
    });
    expect(streaming.stream).toHaveBeenCalledOnce();
    const resumeCall = streaming.stream.mock.calls[0];
    expect(resumeCall?.[0]).toEqual({ conversationId: 'conversation-1', resumeBatchId: 'b1' });
    expect(resumeCall?.[1]).toBe(messageCallbacks);
  });

  it('continues a final decided batch with the shared stream callbacks', () => {
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        citations: null,
        parts: [
          {
            type: 'actions',
            batchId: 'b1',
            actions: [
              { actionId: 'a1', tool: 'inventory.search', summary: 'Search', status: 'confirmed' },
              { actionId: 'a2', tool: 'inventory.search', summary: 'Search', status: 'rejected' },
            ],
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { result } = renderMutations(messages);

    act(() => result.current.sendMessage());
    const sharedCallbacks = streaming.stream.mock.calls[0]?.[1];
    streaming.stream.mockClear();

    const batchDecisions = result.current.batchDecisions;
    expect(batchDecisions?.continuableBatchId).toBe('b1');
    act(() => batchDecisions?.continueBatch?.('b1'));

    expect(streaming.stream).toHaveBeenCalledOnce();
    expect(streaming.stream.mock.calls[0]?.[0]).toEqual({
      conversationId: 'conversation-1',
      resumeBatchId: 'b1',
    });
    expect(streaming.stream.mock.calls[0]?.[1]).toBe(sharedCallbacks);
  });

  it('ignores a different batch id and hides continuation while streaming', () => {
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        citations: null,
        parts: [
          {
            type: 'actions',
            batchId: 'b1',
            actions: [
              { actionId: 'a1', tool: 'inventory.search', summary: 'Search', status: 'confirmed' },
            ],
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { result, rerender } = renderMutations(messages);
    act(() => result.current.batchDecisions?.continueBatch?.('other'));
    expect(streaming.stream).not.toHaveBeenCalled();

    streaming.isStreaming = true;
    rerender();
    expect(result.current.batchDecisions).toBeNull();
    expect(streaming.stream).not.toHaveBeenCalled();
    streaming.isStreaming = false;
  });

  it('exposes no continuable batch while a decision is in flight', async () => {
    const request = deferredValue<{ data: object }>();
    api.egoDecideActionBatch.mockReturnValueOnce(request.promise);
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        citations: null,
        parts: [
          {
            type: 'actions',
            batchId: 'b1',
            actions: [
              { actionId: 'a1', tool: 'inventory.search', summary: 'Search', status: 'confirmed' },
            ],
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { result } = renderMutations(messages);
    const batchDecisions = result.current.batchDecisions;
    let decisionPromise: Promise<void> = Promise.resolve();

    act(() => {
      decisionPromise = batchDecisions?.decide('b1', decision) ?? Promise.resolve();
    });
    expect(result.current.batchDecisions?.continuableBatchId).toBeNull();
    act(() => result.current.batchDecisions?.continueBatch?.('b1'));
    expect(streaming.stream).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({ data: {} });
      await decisionPromise;
    });
  });

  it('does not start a resume when the batch decision fails', async () => {
    api.egoDecideActionBatch.mockResolvedValueOnce({ error: { message: 'gateway down' } });
    const { result } = renderMutations();
    const batchDecisions = result.current.batchDecisions;

    await act(async () => {
      await batchDecisions?.decide('b1', decision);
    });

    expect(streaming.stream).not.toHaveBeenCalled();
    expect(result.current.batchDecisions?.error).toBe('gateway down');
  });

  it('hides batch decisions while a stream holds the shared hook', () => {
    const { result, rerender } = renderMutations();
    expect(result.current.batchDecisions).not.toBeNull();

    streaming.isStreaming = true;
    rerender();
    expect(result.current.batchDecisions).toBeNull();

    streaming.isStreaming = false;
    rerender();
    expect(result.current.batchDecisions?.decide).toBeTypeOf('function');
  });

  it('blocks messages during a decision and starts only the resumed stream after success', async () => {
    const request = deferredValue<{ data: object }>();
    api.egoDecideActionBatch.mockReturnValueOnce(request.promise);
    const { result } = renderMutations();
    const batchDecisions = result.current.batchDecisions;
    let decisionPromise: Promise<void> = Promise.resolve();

    act(() => {
      decisionPromise = batchDecisions?.decide('b1', decision) ?? Promise.resolve();
    });
    expect(result.current.batchDecisions?.decidingBatchId).toBe('b1');

    act(() => result.current.sendMessage());
    expect(streaming.stream).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({ data: {} });
      await decisionPromise;
    });

    expect(streaming.stream).toHaveBeenCalledOnce();
    expect(streaming.stream.mock.calls[0]?.[0]).toEqual({
      conversationId: 'conversation-1',
      resumeBatchId: 'b1',
    });
  });
});
