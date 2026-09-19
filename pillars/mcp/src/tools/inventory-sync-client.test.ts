import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, mockPillarInventory, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { fetchItemRevision, sendItemMutation, withCurrentRevision } =
  await import('./inventory-sync-client.js');

const inventory = mockPillarInventory.inventory;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchItemRevision', () => {
  it('returns the item revision on success', async () => {
    inventory.web.get.mockResolvedValue(callOk({ item: { id: 'item_1', revision: 7 } }));
    const result = await fetchItemRevision('item_1');
    expect(result).toEqual({ kind: 'ok', value: 7 });
  });

  it('passes a failure through untouched', async () => {
    inventory.web.get.mockResolvedValue({ kind: 'not-found', pillar: 'inventory' });
    const result = await fetchItemRevision('missing');
    expect(result).toEqual({ kind: 'not-found', pillar: 'inventory' });
  });
});

describe('sendItemMutation', () => {
  it('builds a one-mutation batch with a fresh mutationId and current clientTime', async () => {
    inventory.sync.mutations.mockResolvedValue(
      callOk({
        outcomes: [
          { mutationId: 'whatever', status: 'applied', revision: 2, seq: 1, converged: false },
        ],
        highWaterSeq: 1,
      })
    );
    const before = Date.now();
    await sendItemMutation('item_1', 'item.setFull', { full: true }, 1);
    const call = inventory.sync.mutations.mock.calls[0]?.[0];
    const mutation = call.mutations[0];
    expect(mutation.op).toBe('item.setFull');
    expect(mutation.entityId).toBe('item_1');
    expect(mutation.baseRevision).toBe(1);
    expect(mutation.dependsOn).toEqual([]);
    expect(mutation.args).toEqual({ full: true });
    expect(typeof mutation.mutationId).toBe('string');
    expect(mutation.mutationId.length).toBeGreaterThan(0);
    expect(Date.parse(mutation.clientTime)).toBeGreaterThanOrEqual(before);
  });

  it('returns bad-request when the batch reports no outcome at all', async () => {
    inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [], highWaterSeq: 1 }));
    const result = await sendItemMutation('item_1', 'item.setFull', { full: true }, 1);
    expect(result.kind).toBe('bad-request');
  });

  it('passes a transport failure through untouched', async () => {
    inventory.sync.mutations.mockResolvedValue({ kind: 'unavailable', pillar: 'inventory' });
    const result = await sendItemMutation('item_1', 'item.setFull', { full: true }, 1);
    expect(result).toEqual({ kind: 'unavailable', pillar: 'inventory' });
  });
});

describe('withCurrentRevision', () => {
  it('short-circuits on a revision-fetch failure without calling send', async () => {
    inventory.web.get.mockResolvedValue({ kind: 'not-found', pillar: 'inventory' });
    const send = vi.fn();
    const result = await withCurrentRevision('missing', send);
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'not-found', pillar: 'inventory' });
  });

  it('calls send with the fetched revision', async () => {
    inventory.web.get.mockResolvedValue(callOk({ item: { id: 'item_1', revision: 9 } }));
    const send = vi
      .fn()
      .mockResolvedValue({ kind: 'ok', value: { mutationId: 'm', status: 'applied' } });
    await withCurrentRevision('item_1', send);
    expect(send).toHaveBeenCalledWith(9);
  });
});
