import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

import { applyConnections, reportCreateSuccess } from './useItemMutations';

import type { PendingConnection } from './types';

afterEach(() => {
  vi.clearAllMocks();
});

describe('applyConnections', () => {
  it('counts successes and failures separately', async () => {
    const pending: PendingConnection[] = [
      { id: 'a', itemName: 'A' },
      { id: 'b', itemName: 'B' },
      { id: 'c', itemName: 'C' },
    ];
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('conflict'))
      .mockRejectedValueOnce(new Error('conflict'));

    const outcome = await applyConnections('new-item', pending, { mutateAsync });

    expect(outcome).toEqual({ connected: 1, failed: 2 });
  });

  it('reports zero failures when there are no pending connections', async () => {
    const mutateAsync = vi.fn();
    const outcome = await applyConnections('new-item', [], { mutateAsync });
    expect(outcome).toEqual({ connected: 0, failed: 0 });
  });
});

describe('reportCreateSuccess', () => {
  it('reports plain success when there were no pending connections', () => {
    reportCreateSuccess({ connected: 0, failed: 0 });
    expect(toast.success).toHaveBeenCalledWith('Item created');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports success with a count when every connection succeeded', () => {
    reportCreateSuccess({ connected: 2, failed: 0 });
    expect(toast.success).toHaveBeenCalledWith('Item created with 2 connections');
  });

  it('does not report a bare success when every pending connection failed', () => {
    reportCreateSuccess({ connected: 0, failed: 3 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Item created; 3 connections failed');
  });

  it('surfaces a partial failure alongside the successful connections', () => {
    reportCreateSuccess({ connected: 1, failed: 1 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Item created with 1 connected; 1 connection failed');
  });
});
