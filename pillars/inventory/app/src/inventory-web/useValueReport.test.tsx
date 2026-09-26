import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webReportsValues: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webReportsValues: (...args: unknown[]) => mocks.webReportsValues(...args),
}));

import { InventoryApiError } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useValueReport, valueReportQueryKey } from './useValueReport';

import type { WebReportsValuesResponse } from '../inventory-api/types.gen.js';

type ValueGroup = WebReportsValuesResponse['groups'][number];

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function report(overrides: Partial<WebReportsValuesResponse> = {}): WebReportsValuesResponse {
  return {
    groups: [],
    totals: {
      purchase: 0,
      records: 0,
      replacement: 0,
      units: 0,
      unvalued: 0,
      withoutPhoto: 0,
    },
    ...overrides,
  };
}

function group(overrides: Partial<ValueGroup> = {}): ValueGroup {
  return {
    entries: [],
    key: 'kitchen',
    label: 'Kitchen',
    records: 0,
    share: 0,
    unvalued: 0,
    value: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useValueReport', () => {
  it('sends by and basis and keys on both', async () => {
    const data = report();
    mocks.webReportsValues.mockResolvedValue(ok(data));
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ by, basis }: { by: 'room' | 'type'; basis: 'replacement' | 'purchase' }) =>
        useValueReport(by, basis),
      {
        initialProps: { by: 'room', basis: 'replacement' },
        wrapper: withQueryClient(client),
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.webReportsValues).toHaveBeenCalledWith({
      query: { by: 'room', basis: 'replacement' },
    });
    expect(
      client.getQueryCache().find({
        queryKey: valueReportQueryKey('room', 'replacement'),
        exact: true,
      })
    ).toBeDefined();

    rerender({ by: 'type', basis: 'purchase' });
    await waitFor(() => expect(mocks.webReportsValues).toHaveBeenCalledTimes(2));
    expect(mocks.webReportsValues).toHaveBeenLastCalledWith({
      query: { by: 'type', basis: 'purchase' },
    });
    expect(
      client.getQueryCache().find({
        queryKey: valueReportQueryKey('type', 'purchase'),
        exact: true,
      })
    ).toBeDefined();
  });

  it('keeps a zero unvalued count and an empty groups list', async () => {
    const data = report({
      totals: {
        purchase: 120,
        records: 3,
        replacement: 240,
        units: 4,
        unvalued: 0,
        withoutPhoto: 1,
      },
    });
    mocks.webReportsValues.mockResolvedValue(ok(data));

    const { result } = renderHook(() => useValueReport('room', 'replacement'), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(result.current.data?.totals.unvalued).toBe(0);
    expect(result.current.data?.groups).toEqual([]);
  });

  it("keeps a group's unvalued entries in server order", async () => {
    const data = report({
      groups: [
        group({
          records: 3,
          unvalued: 2,
          entries: [
            {
              code: 'B',
              isContainer: false,
              itemId: 'item-b',
              name: 'Second',
              quantity: 1,
              typeKey: 'lamp',
              unitValue: null,
              value: null,
            },
            {
              code: 'A',
              isContainer: false,
              itemId: 'item-a',
              name: 'First',
              quantity: 2,
              typeKey: 'chair',
              unitValue: null,
              value: null,
            },
          ],
        }),
      ],
    });
    mocks.webReportsValues.mockResolvedValue(ok(data));

    const { result } = renderHook(() => useValueReport('room', 'purchase'), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groups[0]).toEqual(data.groups[0]);
    expect(result.current.data?.groups[0]?.entries.map((entry) => entry.itemId)).toEqual([
      'item-b',
      'item-a',
    ]);
  });

  it('reports pending, then the InventoryApiError from the server', async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    mocks.webReportsValues.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useValueReport('room', 'replacement'), {
      wrapper: withQueryClient(client),
    });

    expect(result.current.isPending).toBe(true);
    const error = new InventoryApiError('reports unavailable', 503);
    resolveRequest({
      data: undefined,
      error: { message: error.message },
      response: { status: error.status },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(InventoryApiError);
    expect(result.current.error).toMatchObject({ message: error.message, status: error.status });
  });

  it('sits under the web key that verbs invalidate', async () => {
    mocks.webReportsValues.mockResolvedValue(ok(report()));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useValueReport('room', 'replacement'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await client.invalidateQueries({ queryKey: ['inventory', 'web'] });
    await waitFor(() => expect(mocks.webReportsValues).toHaveBeenCalledTimes(2));
  });
});
