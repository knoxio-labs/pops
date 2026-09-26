import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webMovingGet: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webMovingGet: (...args: unknown[]) => mocks.webMovingGet(...args),
}));

import { InventoryApiError } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useMovingDay, WEB_MOVING_DAY_QUERY_KEY } from './useMovingDay';

import type { WebMovingGetResponse } from '../inventory-api/types.gen.js';
import type { MovingDayQuery } from './useMovingDay';

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const movingDay: WebMovingGetResponse = {
  boxes: [
    {
      code: 'K04',
      contents: [{ code: null, containerId: 'box-2', id: 'thing-2', name: 'Kettle' }],
      count: 1,
      destination: { label: 'Banksia Road flat', optionKey: 'banksia' },
      id: 'box-2',
      name: 'Kitchen 03',
      placement: { kind: 'location', locationId: 'home' },
      stage: 'closed',
    },
    {
      code: null,
      contents: [],
      count: 0,
      destination: null,
      id: 'box-1',
      name: 'Unassigned',
      placement: { kind: 'hand' },
      stage: 'packing',
    },
  ],
  destinationOptions: [
    { label: 'Banksia Road flat', optionKey: 'banksia' },
    { label: 'Storage', optionKey: 'storage' },
  ],
  inHand: [{ code: 'H1', id: 'hand-1', name: 'Lamp' }],
  loose: [
    {
      items: [{ code: null, id: 'loose-1', name: 'Plate' }],
      room: { id: 'kitchen', name: 'Kitchen' },
    },
  ],
  looseCount: 1,
  packed: 1,
  stages: { closed: 1, full: 0, packing: 1 },
  unlabelledClosed: 0,
};

const emptyMovingDay: WebMovingGetResponse = {
  boxes: [],
  destinationOptions: [],
  inHand: [],
  loose: [],
  looseCount: 0,
  packed: 0,
  stages: { closed: 0, full: 0, packing: 0 },
  unlabelledClosed: 0,
};

function renderMovingDay(query?: MovingDayQuery) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...renderHook(() => useMovingDay(query), { wrapper: withQueryClient(queryClient) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useMovingDay', () => {
  it('passes destinationField and homeLocationId through and leaves out undefined ones', async () => {
    mocks.webMovingGet.mockResolvedValue(ok(movingDay));
    const query = { destinationField: 'Move destination', homeLocationId: 'home' };
    const first = renderMovingDay(query);

    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(mocks.webMovingGet).toHaveBeenCalledWith({
      query: { destinationField: 'Move destination', homeLocationId: 'home' },
    });

    const second = renderMovingDay({ destinationField: 'Move destination' });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(mocks.webMovingGet).toHaveBeenLastCalledWith({
      query: { destinationField: 'Move destination' },
    });

    const third = renderMovingDay();
    await waitFor(() => expect(third.result.current.isSuccess).toBe(true));
    expect(mocks.webMovingGet).toHaveBeenLastCalledWith({ query: {} });
  });

  it('returns the moving-day totals unchanged', async () => {
    mocks.webMovingGet.mockResolvedValue(ok(movingDay));
    const { result } = renderMovingDay();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(movingDay);
    expect(result.current.data?.boxes.map((box) => box.destination)).toEqual([
      { label: 'Banksia Road flat', optionKey: 'banksia' },
      null,
    ]);
    expect(result.current.data?.destinationOptions).toEqual([
      { label: 'Banksia Road flat', optionKey: 'banksia' },
      { label: 'Storage', optionKey: 'storage' },
    ]);
    expect(result.current.data?.looseCount).toBe(1);
    expect(result.current.data?.packed).toBe(1);
    expect(result.current.data?.stages).toEqual({ closed: 1, full: 0, packing: 1 });
  });

  it('keeps an empty server response empty', async () => {
    mocks.webMovingGet.mockResolvedValue(ok(emptyMovingDay));
    const { result } = renderMovingDay();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(emptyMovingDay);
    expect(result.current.data?.boxes).toEqual([]);
    expect(result.current.data?.destinationOptions).toEqual([]);
    expect(result.current.data?.looseCount).toBe(0);
  });

  it('is pending until the response arrives', async () => {
    let resolve: ((value: ReturnType<typeof ok<WebMovingGetResponse>>) => void) | undefined;
    const response = new Promise<ReturnType<typeof ok<WebMovingGetResponse>>>((settle) => {
      resolve = settle;
    });
    mocks.webMovingGet.mockReturnValue(response);
    const { result } = renderMovingDay();

    expect(result.current.isPending).toBe(true);
    await act(async () => resolve?.(ok(movingDay)));
    await waitFor(() => expect(result.current.data).toBe(movingDay));
  });

  it('reports a generated-client error', async () => {
    mocks.webMovingGet.mockResolvedValue({
      data: undefined,
      error: { message: 'moving day unavailable' },
      response: new Response(null, { status: 503 }),
    });
    const { result } = renderMovingDay();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(InventoryApiError);
    expect(result.current.error?.message).toBe('moving day unavailable');
  });

  it('sits under the web key so a web invalidation refetches it', async () => {
    const refreshed = { ...movingDay, packed: 2 };
    mocks.webMovingGet.mockResolvedValueOnce(ok(movingDay)).mockResolvedValueOnce(ok(refreshed));
    const { queryClient, result, rerender } = renderMovingDay();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryCache().find({ queryKey: WEB_MOVING_DAY_QUERY_KEY, exact: false })
    ).toBeDefined();

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
    });
    expect(mocks.webMovingGet).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData([...WEB_MOVING_DAY_QUERY_KEY, {}])).toEqual(refreshed);
    rerender();
    await waitFor(() => expect(result.current.data).toEqual(refreshed));
  });
});
