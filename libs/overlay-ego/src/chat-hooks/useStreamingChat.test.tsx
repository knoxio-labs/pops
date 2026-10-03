import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider, useSetPageContext } from '@pops/navigation';

import { useEgoAppContext } from './useEgoAppContext';
import { EGO_STREAM_URL, useStreamingChat } from './useStreamingChat';

import type { ReactNode } from 'react';

import type { AppContextEntity } from '@pops/navigation';

import type { StreamFrame } from './stream-frames';
import type { UseStreamingChatReturn } from './useStreamingChat';

const callbacks = { onConversation: vi.fn(), onEngrams: vi.fn(), onInvalidate: vi.fn() };

type StreamCallbacks = Parameters<UseStreamingChatReturn['stream']>[1];

function makeCallbacks(overrides: Partial<StreamCallbacks> = {}): StreamCallbacks {
  return {
    onConversation: vi.fn(),
    onEngrams: vi.fn(),
    onInvalidate: vi.fn(),
    ...overrides,
  };
}

function createControlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  return {
    response: new Response(body),
    send(frame: StreamFrame) {
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(frame) + '\n\n'));
    },
    close() {
      controller.close();
    },
    interrupt() {
      const error = new Error('The stream was interrupted.');
      error.name = 'AbortError';
      controller.error(error);
    },
  };
}

function wrapperAt(path: string, entity?: AppContextEntity) {
  function Page() {
    useSetPageContext({ page: 'detail', pageType: 'drill-down', entity });
    return null;
  }
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <AppContextProvider>
          {entity ? <Page /> : null}
          {children}
        </AppContextProvider>
      </MemoryRouter>
    );
  };
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('useEgoAppContext', () => {
  it('is undefined when no app is active', () => {
    const { result } = renderHook(() => useEgoAppContext(), { wrapper: wrapperAt('/') });
    expect(result.current).toBeUndefined();
  });

  it('carries the app and route on a list page', () => {
    const { result } = renderHook(() => useEgoAppContext(), {
      wrapper: wrapperAt('/finance/transactions'),
    });
    expect(result.current).toEqual({ app: 'finance', route: '/finance/transactions' });
  });

  it('parses the entity id and title from the entity uri', () => {
    const { result } = renderHook(() => useEgoAppContext(), {
      wrapper: wrapperAt('/inventory/items/abc', {
        uri: 'pops:inventory/item/abc',
        type: 'item',
        title: 'Bosch drill',
      }),
    });
    expect(result.current).toEqual({
      app: 'inventory',
      route: '/inventory/items/abc',
      entityType: 'item',
      entityId: 'abc',
      entityTitle: 'Bosch drill',
    });
  });

  it('keeps slashes inside the entity id', () => {
    const { result } = renderHook(() => useEgoAppContext(), {
      wrapper: wrapperAt('/inventory/items/a', {
        uri: 'pops:inventory/item/a/b',
        type: 'item',
        title: 'T',
      }),
    });
    expect(result.current?.entityId).toBe('a/b');
  });

  it('drops the entity when its uri does not parse', () => {
    const { result } = renderHook(() => useEgoAppContext(), {
      wrapper: wrapperAt('/inventory/items/a', { uri: 'garbage', type: 'item', title: 'T' }),
    });
    expect(result.current).toEqual({ app: 'inventory', route: '/inventory/items/a' });
  });
});

describe('useStreamingChat request body', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start: (c) => c.close() })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the stream request through the cerebrum proxy path', async () => {
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });
    act(() => result.current.stream({ conversationId: null, message: 'hi' }, callbacks));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/cerebrum-api/ego/chat/stream');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(EGO_STREAM_URL);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('sends appContext when the shell provides one', async () => {
    const { result } = renderHook(() => useStreamingChat(), {
      wrapper: wrapperAt('/inventory/items/abc', {
        uri: 'pops:inventory/item/abc',
        type: 'item',
        title: 'Bosch drill',
      }),
    });
    act(() => result.current.stream({ conversationId: null, message: 'hi' }, callbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastRequestBody(fetchMock)).toEqual({
      message: 'hi',
      appContext: {
        app: 'inventory',
        route: '/inventory/items/abc',
        entityType: 'item',
        entityId: 'abc',
        entityTitle: 'Bosch drill',
      },
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('sends purchase app context with an entity on the purchase detail route', async () => {
    const { result } = renderHook(() => useStreamingChat(), {
      wrapper: wrapperAt('/purchases/PO-123', {
        uri: 'pops:purchases/purchase/PO-123',
        type: 'purchase',
        title: 'January purchase',
      }),
    });
    act(() => result.current.stream({ conversationId: null, message: 'hi' }, callbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(lastRequestBody(fetchMock)).toEqual({
      message: 'hi',
      appContext: {
        app: 'purchases',
        route: '/purchases/PO-123',
        entityType: 'purchase',
        entityId: 'PO-123',
        entityTitle: 'January purchase',
      },
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('omits appContext when the shell provides none', async () => {
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });
    act(() => result.current.stream({ conversationId: 'c1', message: 'hi' }, callbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = lastRequestBody(fetchMock);
    expect(body).toEqual({ conversationId: 'c1', message: 'hi' });
    expect('appContext' in body).toBe(false);
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });
});

describe('useStreamingChat stream frames', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tracks the latest status for a streamed tool call', async () => {
    const controlled = createControlledResponse();
    const streamCallbacks = makeCallbacks();
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, streamCallbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => controlled.send({ type: 'tool', name: 'inventory.search', status: 'started' }));
    await waitFor(() => {
      expect(result.current.toolActivity).toEqual([
        { name: 'inventory.search', status: 'started' },
      ]);
    });

    act(() => controlled.send({ type: 'tool', name: 'inventory.search', status: 'finished' }));
    await waitFor(() => {
      expect(result.current.toolActivity).toEqual([
        { name: 'inventory.search', status: 'finished' },
      ]);
    });

    act(() => controlled.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('exposes streamed entity parts', async () => {
    const controlled = createControlledResponse();
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, makeCallbacks()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() =>
      controlled.send({
        type: 'part',
        part: { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
      })
    );
    await waitFor(() => {
      expect(result.current.streamParts).toEqual([
        { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
      ]);
    });

    act(() => controlled.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('calls onNavigate for a navigation frame', async () => {
    const controlled = createControlledResponse();
    const onNavigate = vi.fn();
    const streamCallbacks = makeCallbacks({ onNavigate });
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, streamCallbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => controlled.send({ type: 'navigate', uri: 'pops:inventory/item/drill-1' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('pops:inventory/item/drill-1'));

    act(() => controlled.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('accumulates token frames into streamingContent', async () => {
    const controlled = createControlledResponse();
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, makeCallbacks()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => controlled.send({ type: 'token', text: 'hello' }));
    await waitFor(() => expect(result.current.streamingContent).toBe('hello'));

    act(() => controlled.send({ type: 'token', text: ' world' }));
    await waitFor(() => expect(result.current.streamingContent).toBe('hello world'));

    act(() => controlled.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('keeps streamed content visible until the persisted conversation is invalidated', async () => {
    const controlled = createControlledResponse();
    let resolveInvalidation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      resolveInvalidation = resolve;
    });
    const onInvalidate = vi.fn(() => invalidation);
    const streamCallbacks = makeCallbacks({ onInvalidate });
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, streamCallbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.send({ type: 'token', text: 'Found it.' });
      controlled.send({ type: 'tool', name: 'inventory.search', status: 'started' });
      controlled.send({
        type: 'part',
        part: { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
      });
      controlled.send({
        type: 'done',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        retrievedEngrams: [],
        parts: [],
      });
    });

    await waitFor(() => expect(onInvalidate).toHaveBeenCalledWith('conversation-1'));
    expect(streamCallbacks.onConversation).toHaveBeenCalledWith('conversation-1');
    expect(streamCallbacks.onEngrams).toHaveBeenCalledWith([]);
    expect(result.current.streamingContent).toBe('Found it.');
    expect(result.current.toolActivity).toEqual([{ name: 'inventory.search', status: 'started' }]);
    expect(result.current.streamParts).toEqual([
      { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
    ]);

    act(() => controlled.close());
    await act(async () => {
      resolveInvalidation();
      await invalidation;
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.streamingContent).toBeNull();
    expect(result.current.toolActivity).toEqual([]);
    expect(result.current.streamParts).toEqual([]);
  });

  it('sets an error and clears stream state for an error frame', async () => {
    const controlled = createControlledResponse();
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, makeCallbacks()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => controlled.send({ type: 'error', message: 'Gateway unavailable' }));
    act(() => controlled.close());

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBe('Gateway unavailable');
    });
    expect(result.current.streamingContent).toBeNull();
    expect(result.current.toolActivity).toEqual([]);
    expect(result.current.streamParts).toEqual([]);
  });

  it('ignores a repeated call while streaming and resets state on the next stream', async () => {
    const first = createControlledResponse();
    const second = createControlledResponse();
    fetchMock.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    const streamCallbacks = makeCallbacks();
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'first' }, streamCallbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      first.send({ type: 'token', text: 'old' });
      first.send({ type: 'tool', name: 'inventory.search', status: 'started' });
      first.send({
        type: 'part',
        part: { type: 'entity', uri: 'pops:inventory/item/old', title: 'Old item' },
      });
    });
    await waitFor(() => expect(result.current.streamParts).toHaveLength(1));

    act(() => result.current.stream({ conversationId: null, message: 'ignored' }, streamCallbacks));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => first.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    act(() => result.current.stream({ conversationId: null, message: 'second' }, streamCallbacks));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.streamingContent).toBe('');
    expect(result.current.toolActivity).toEqual([]);
    expect(result.current.streamParts).toEqual([]);

    act(() => second.close());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('preserves partial state when the stream is interrupted', async () => {
    const controlled = createControlledResponse();
    fetchMock.mockResolvedValue(controlled.response);
    const { result } = renderHook(() => useStreamingChat(), { wrapper: wrapperAt('/') });

    act(() => result.current.stream({ conversationId: null, message: 'hi' }, makeCallbacks()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.send({ type: 'token', text: 'partial reply' });
      controlled.send({ type: 'tool', name: 'inventory.search', status: 'started' });
    });
    await waitFor(() => expect(result.current.toolActivity).toHaveLength(1));

    act(() => controlled.interrupt());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.streamingContent).toBe('partial reply');
    expect(result.current.toolActivity).toEqual([{ name: 'inventory.search', status: 'started' }]);
  });
});
