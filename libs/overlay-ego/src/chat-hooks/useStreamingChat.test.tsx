import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider, useSetPageContext } from '@pops/navigation';

import { useEgoAppContext } from './useEgoAppContext';
import { EGO_STREAM_URL, useStreamingChat } from './useStreamingChat';

import type { ReactNode } from 'react';

import type { AppContextEntity } from '@pops/navigation';

const callbacks = { onConversation: vi.fn(), onEngrams: vi.fn(), onInvalidate: vi.fn() };

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
