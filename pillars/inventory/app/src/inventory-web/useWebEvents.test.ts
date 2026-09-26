import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { WebEventsListResponses } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ webEventsList: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webEventsList: (...args: unknown[]) => mocks.webEventsList(...args),
}));

import { useWebEvents } from './useWebEvents';

type Page = WebEventsListResponses[200];

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function event(seq: number, kind = 'created'): Page['events'][number] {
  return {
    actor: { kind: 'device', label: 'Phone' },
    after: {},
    before: {},
    clientTime: null,
    compensatesSeq: null,
    entityId: `item-${seq}`,
    entityKind: 'item',
    entityName: `Item ${seq}`,
    fields: ['name'],
    kind,
    reason: null,
    seq,
    serverTime: `2026-09-01T00:00:0${seq}.000Z`,
    undoable: false,
  };
}

function page(overrides: Partial<Page> = {}): Page {
  return {
    events: [],
    kindCounts: { created: 1, moved: 2 },
    nextCursor: null,
    total: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webEventsList.mockResolvedValue(ok(page({ events: [event(1)] })));
});

describe('useWebEvents', () => {
  it('sends only the default pagination query and preserves server order', async () => {
    mocks.webEventsList.mockResolvedValue(
      ok(page({ events: [event(2, 'moved'), event(1, 'created')] }))
    );
    const { result } = renderHook(() => useWebEvents({}), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.webEventsList).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 50, cursor: undefined } })
    );
    expect(result.current.events.map((entry) => entry.seq)).toEqual([2, 1]);
    expect(result.current.kindCounts).toEqual({ created: 1, moved: 2 });
    expect(result.current.total).toBe(1);
  });

  it('joins kinds, trims q, and passes the remaining filters through', async () => {
    const { result } = renderHook(
      () =>
        useWebEvents({
          kinds: ['moved', 'stored'],
          actorKind: 'web',
          entityId: 'item-1',
          q: '  lamp  ',
          limit: 12,
        }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.webEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          kind: 'moved,stored',
          actorKind: 'web',
          entityId: 'item-1',
          q: 'lamp',
          limit: 12,
          cursor: undefined,
        },
      })
    );
  });

  it('keeps first-page counts while appending later pages', async () => {
    mocks.webEventsList.mockImplementation(async ({ query }: { query: { cursor?: string } }) =>
      ok(
        query.cursor === undefined
          ? page({ events: [event(1)], nextCursor: 'next', total: 3 })
          : page({ events: [event(2, 'moved')], kindCounts: { created: 1, moved: 2 }, total: 99 })
      )
    );
    const { result } = renderHook(() => useWebEvents({}), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    result.current.fetchNextPage();
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    expect(result.current.events.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(result.current.total).toBe(3);
    expect(result.current.kindCounts).toEqual({ created: 1, moved: 2 });
    expect(mocks.webEventsList).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { limit: 50, cursor: 'next' } })
    );
  });

  it('reports a transport error as an error feed', async () => {
    mocks.webEventsList.mockResolvedValue({
      data: undefined,
      error: { message: 'offline' },
      response: { status: 503 },
    });
    const { result } = renderHook(() => useWebEvents({}), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatchObject({ message: 'offline', status: 503 });
    expect(result.current.events).toEqual([]);
    expect(result.current.total).toBeNull();
  });
});
