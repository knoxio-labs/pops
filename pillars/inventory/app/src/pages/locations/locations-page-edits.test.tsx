import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../../foundation/test-fixtures/core';
import { useLocationsEdits } from './locations-page-edits';

import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({
  locationsCreate: (...args: unknown[]) => api.create(...args),
  locationsUpdate: vi.fn(),
  locationsDelete: vi.fn(),
}));
vi.mock('../../inventory-web/usePlaceMutations.js', () => ({
  usePlaceMutations: () => ({ arrange: vi.fn(), remove: vi.fn() }),
}));

function renderEdits() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(
    () =>
      useLocationsEdits({
        online: true,
        world: coreWorld,
        tallyOf: () => ({ boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 }),
        onDeleted: vi.fn(),
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
}

describe('useLocationsEdits create draft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the inline editor open when a sibling name is rejected', () => {
    const sibling = [...coreWorld.locations.values()][0];
    if (sibling === undefined) throw new Error('The test needs a place.');
    const { result } = renderEdits();
    act(() => result.current.startCreate(sibling.parentId));
    act(() => result.current.commitCreate(` ${sibling.name.toUpperCase()} `));

    expect(result.current.creatingUnder).toBe(sibling.parentId);
    expect(result.current.error).toContain('already has a place called');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('retains the editor on server failure and closes it only after a successful retry', async () => {
    api.create.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({
      data: { id: 'created-place' },
      error: undefined,
      response: { status: 201 },
    });
    const { result } = renderEdits();
    act(() => result.current.startCreate(null));
    act(() => result.current.commitCreate(' New place '));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.creatingUnder).toBeNull();
    act(() => result.current.commitCreate(' New place '));
    await waitFor(() => expect(result.current.creatingUnder).toBeUndefined());
    expect(api.create).toHaveBeenLastCalledWith({
      body: { name: 'New place', parentId: null, sortOrder: 0 },
    });
  });
});
