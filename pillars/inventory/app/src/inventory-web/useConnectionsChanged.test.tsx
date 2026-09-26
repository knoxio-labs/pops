import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { WebChangesHeadResponses } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  connectionsConnect: vi.fn(),
  connectionsDisconnect: vi.fn(),
  fixturesConnect: vi.fn(),
  fixturesDisconnect: vi.fn(),
  webChangesHead: vi.fn(),
  webConnectionsList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  connectionsConnect: (...args: unknown[]) => mocks.connectionsConnect(...args),
  connectionsDisconnect: (...args: unknown[]) => mocks.connectionsDisconnect(...args),
  fixturesConnect: (...args: unknown[]) => mocks.fixturesConnect(...args),
  fixturesDisconnect: (...args: unknown[]) => mocks.fixturesDisconnect(...args),
  webChangesHead: (...args: unknown[]) => mocks.webChangesHead(...args),
  webConnectionsList: (...args: unknown[]) => mocks.webConnectionsList(...args),
}));

import { CHANGES_POLL_MS } from './useChangedElsewhere';
import { useConnectionsChanged } from './useConnectionsChanged';
import { useConnectionMutations } from './useConnectionsRegistry';

type Head = WebChangesHeadResponses[200] & { connectionsChangedAt: string | null };

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function head(connectionsChangedAt: string | null): Head {
  return { connectionsChangedAt, groups: [], headSeq: 0 };
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let visibility = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  mocks.connectionsConnect.mockResolvedValue(ok({ message: 'connected' }));
  mocks.connectionsDisconnect.mockResolvedValue(ok({ message: 'disconnected' }));
  mocks.fixturesConnect.mockResolvedValue(ok({ message: 'connected' }));
  mocks.fixturesDisconnect.mockResolvedValue(ok({ message: 'disconnected' }));
  mocks.webConnectionsList.mockResolvedValue(
    ok({ rows: [], nextCursor: null, summary: { connections: 0, fixtures: 0, items: 0 } })
  );
  mocks.webChangesHead.mockResolvedValue(ok(head(null)));
});

afterEach(() => {
  vi.useRealTimers();
});

async function poll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
  });
  await flushPromises();
}

describe('useConnectionsChanged', () => {
  it('takes the head timestamp as baseline and reports a later one', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:01:00.000Z')));
    const { result } = renderHook(
      () => useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    expect(result.current.stale).toBe(false);
    await poll();
    expect(result.current.changedAt).toBe('2026-09-01T00:01:00.000Z');
    expect(result.current.stale).toBe(true);
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(2);
  });

  it('reports the first change when the baseline is null and not when null stays null', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head(null)))
      .mockResolvedValueOnce(ok(head(null)))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:02:00.000Z')));
    const { result } = renderHook(
      () => useConnectionsChanged({ queryKeys: [['inventory', 'fixtures']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    await poll();
    expect(result.current.stale).toBe(false);
    await poll();
    expect(result.current.stale).toBe(true);
    expect(result.current.changedAt).toBe('2026-09-01T00:02:00.000Z');
  });

  it('does not report this app own connect', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:03:00.000Z')));
    const { result } = renderHook(
      () => ({
        changed: useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
        mutations: useConnectionMutations(),
      }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    await result.current.mutations.connectItems('item-a', 'item-b');
    await poll();
    expect(result.current.changed.stale).toBe(false);
  });

  it('absorbs a write completed while a poll request is in flight', async () => {
    let resolvePoll: ((value: ReturnType<typeof ok<Head>>) => void) | undefined;
    const pollResponse = new Promise<ReturnType<typeof ok<Head>>>((resolve) => {
      resolvePoll = resolve;
    });
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockImplementationOnce(() => pollResponse)
      .mockResolvedValueOnce(ok(head('2026-09-01T00:05:00.000Z')));
    const { result } = renderHook(
      () => ({
        changed: useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
        mutations: useConnectionMutations(),
      }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    await poll();
    await result.current.mutations.connectItems('item-a', 'item-b');
    if (resolvePoll === undefined) throw new Error('poll response was not created');
    resolvePoll(ok(head('2026-09-01T00:04:00.000Z')));
    await flushPromises();
    expect(result.current.changed.stale).toBe(false);
    await poll();
    expect(result.current.changed.changedAt).toBe('2026-09-01T00:05:00.000Z');
  });

  it('lets two mounted instances absorb the same local write independently', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:04:00.000Z')));
    const { result } = renderHook(
      () => ({
        first: useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
        second: useConnectionsChanged({ queryKeys: [['inventory', 'fixtures']] }),
        mutations: useConnectionMutations(),
      }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    await result.current.mutations.connectItems('item-a', 'item-b');
    await poll();
    expect(result.current.first.stale).toBe(false);
    expect(result.current.second.stale).toBe(false);
  });

  it('absorbs a local write after a failed poll, then reports a later remote change', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:05:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:06:00.000Z')));
    const { result } = renderHook(
      () => ({
        changed: useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
        mutations: useConnectionMutations(),
      }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    await result.current.mutations.connectItems('item-a', 'item-b');
    await poll();
    expect(result.current.changed.stale).toBe(false);
    await poll();
    expect(result.current.changed.stale).toBe(false);
    await poll();
    expect(result.current.changed.stale).toBe(true);
    expect(result.current.changed.changedAt).toBe('2026-09-01T00:06:00.000Z');
  });

  it('does not poll while hidden and polls once on becoming visible', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:07:00.000Z')));
    const { result } = renderHook(
      () => useConnectionsChanged({ queryKeys: [['inventory', 'connections']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    visibility = 'hidden';
    await poll();
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await flushPromises();
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(2);
    expect(result.current.stale).toBe(true);
  });

  it('reloads the supplied queries and takes a new baseline', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head('2026-09-01T00:00:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:08:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:09:00.000Z')))
      .mockResolvedValueOnce(ok(head('2026-09-01T00:10:00.000Z')));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(
      () =>
        useConnectionsChanged({
          queryKeys: [
            ['inventory', 'connections'],
            ['inventory', 'fixtures'],
          ],
        }),
      { wrapper: withQueryClient(queryClient) }
    );

    await flushPromises();
    await poll();
    expect(result.current.stale).toBe(true);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.stale).toBe(false);
    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: ['inventory', 'connections'],
      refetchType: 'active',
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: ['inventory', 'fixtures'],
      refetchType: 'active',
    });
    await poll();
    expect(result.current.changedAt).toBe('2026-09-01T00:10:00.000Z');
  });

  it('waits for enabled before taking a baseline', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useConnectionsChanged({ enabled, queryKeys: [['inventory', 'connections']] }),
      { initialProps: { enabled: false }, wrapper: withQueryClient(createTestQueryClient()) }
    );

    await flushPromises();
    expect(mocks.webChangesHead).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await flushPromises();
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    expect(result.current.stale).toBe(false);
  });
});
