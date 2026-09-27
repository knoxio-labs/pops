import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';
import { LOCATION_TALLIES_QUERY_KEY, useLocationTallies } from './useLocationTallies';

const mocks = vi.hoisted(() => ({
  webLocationsTallies: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  webLocationsTallies: (...args: unknown[]) => mocks.webLocationsTallies(...args),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webLocationsTallies.mockResolvedValue(
    ok({
      tallies: {
        room: { boxesHere: 2, inBoxes: 3, itemsHere: 4, places: 1, total: 9 },
      },
    })
  );
});

describe('useLocationTallies', () => {
  it('reads the tallies under a web key and gives zeros for an unknown place', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useLocationTallies(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(mocks.webLocationsTallies).toHaveBeenCalledWith();
    expect(client.getQueryData(LOCATION_TALLIES_QUERY_KEY)).toEqual({
      tallies: {
        room: { boxesHere: 2, inBoxes: 3, itemsHere: 4, places: 1, total: 9 },
      },
    });
    expect(result.current.tallyOf('room')).toEqual({
      boxesHere: 2,
      inBoxes: 3,
      itemsHere: 4,
      places: 1,
      total: 9,
    });
    expect(result.current.tallyOf('missing')).toEqual({
      boxesHere: 0,
      inBoxes: 0,
      itemsHere: 0,
      places: 0,
      total: 0,
    });
  });
});
