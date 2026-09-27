import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';
import { REPORT_ENTRIES_QUERY_KEY, useReportEntries } from './useReportEntries';

import type { WebReportsEntriesResponse } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ webReportsEntries: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webReportsEntries: (...args: unknown[]) => mocks.webReportsEntries(...args),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

const entries: WebReportsEntriesResponse['entries'] = [
  {
    code: 'K-1',
    effectiveLocationId: 'kitchen',
    isContainer: false,
    itemId: 'item-1',
    name: 'Kettle',
    photos: 1,
    place: 'Kitchen',
    purchasePrice: 40,
    purchasedOn: '2025-01-01',
    quantity: 1,
    receiptId: 17,
    replacementValue: 80,
    room: { key: 'kitchen', label: 'Kitchen' },
    typeKey: 'appliance',
    warrantyExpires: '2026-12-01',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useReportEntries', () => {
  it('reads the entries under the web reports key', async () => {
    mocks.webReportsEntries.mockResolvedValue(ok({ entries }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useReportEntries(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.webReportsEntries).toHaveBeenCalledWith();
    expect(result.current.data).toEqual(entries);
    expect(client.getQueryData(REPORT_ENTRIES_QUERY_KEY)).toEqual(entries);
  });
});
