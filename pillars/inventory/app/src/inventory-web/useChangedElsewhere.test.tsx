import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { WebChangesHeadResponses } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ webChangesHead: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webChangesHead: (...args: unknown[]) => mocks.webChangesHead(...args),
}));

import { CHANGES_POLL_MS, useChangedElsewhere } from './useChangedElsewhere';

type Head = WebChangesHeadResponses[200];

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function group(eventCount = 1): Head['groups'][number] {
  return {
    actorId: 'phone-1',
    actorKind: 'device',
    actorLabel: 'Phone',
    entityCount: eventCount,
    eventCount,
    kindCounts: { moved: eventCount },
    latestServerTime: '2026-09-01T00:00:00.000Z',
  };
}

function head(headSeq: number, groups: Head['groups'] = []): Head {
  return { headSeq, groups };
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
  vi.clearAllMocks();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  mocks.webChangesHead.mockResolvedValue(ok(head(10)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useChangedElsewhere', () => {
  it('takes a baseline and polls with since while visible', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head(10)))
      .mockResolvedValueOnce(ok(head(13, [group(3)])));
    const { result } = renderHook(
      () => useChangedElsewhere({ queryKeys: [['inventory', 'web', 'items']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    expect(mocks.webChangesHead).toHaveBeenLastCalledWith({ query: {} });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
    });
    await flushPromises();
    expect(result.current.groups).toEqual([group(3)]);
    expect(mocks.webChangesHead).toHaveBeenLastCalledWith({ query: { since: 10 } });
    expect(result.current.stale).toBe(true);
  });

  it('does not poll while hidden and polls on becoming visible', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head(10)))
      .mockResolvedValueOnce(ok(head(12, [group(2)])));
    const { result } = renderHook(
      () => useChangedElsewhere({ queryKeys: [['inventory', 'web', 'items']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
    });
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushPromises();
    expect(result.current.groups).toEqual([group(2)]);
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous groups when a poll fails', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head(10)))
      .mockResolvedValueOnce(ok(head(11, [group()])))
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(
      () => useChangedElsewhere({ queryKeys: [['inventory', 'web', 'items']] }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
    });
    await flushPromises();
    expect(result.current.groups).toEqual([group()]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
    });
    await flushPromises();
    expect(result.current.groups).toEqual([group()]);
  });

  it('reloads only the page queries, then clears groups at a new baseline', async () => {
    mocks.webChangesHead
      .mockResolvedValueOnce(ok(head(10)))
      .mockResolvedValueOnce(ok(head(11, [group()])))
      .mockResolvedValueOnce(ok(head(20)));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(
      () =>
        useChangedElsewhere({
          queryKeys: [
            ['inventory', 'web', 'items'],
            ['inventory', 'web', 'summary'],
          ],
        }),
      { wrapper: withQueryClient(client) }
    );

    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANGES_POLL_MS);
    });
    await flushPromises();
    expect(result.current.stale).toBe(true);

    await act(async () => {
      await result.current.reload();
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: ['inventory', 'web', 'items'],
      refetchType: 'active',
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: ['inventory', 'web', 'summary'],
      refetchType: 'active',
    });
    expect(mocks.webChangesHead).toHaveBeenLastCalledWith({ query: {} });
    expect(result.current.groups).toEqual([]);
    expect(result.current.stale).toBe(false);
  });

  it('waits for enabled before reading a baseline and passes entityId', async () => {
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useChangedElsewhere({ enabled, entityId: 'item-1', queryKeys: [] }),
      { initialProps: { enabled: false }, wrapper: withQueryClient(client) }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.webChangesHead).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(mocks.webChangesHead).toHaveBeenCalledTimes(1);
    expect(mocks.webChangesHead).toHaveBeenCalledWith({ query: { entityId: 'item-1' } });
    expect(result.current.groups).toEqual([]);
  });
});
