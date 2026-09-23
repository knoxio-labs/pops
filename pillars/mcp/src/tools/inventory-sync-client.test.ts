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
  it('preserves caller retry identity and catalogue revision in a one-mutation batch', async () => {
    inventory.sync.mutations.mockResolvedValue(
      callOk({
        outcomes: [
          { mutationId: 'whatever', status: 'applied', revision: 2, seq: 1, converged: false },
        ],
        highWaterSeq: 1,
      })
    );
    const before = Date.now();
    await sendItemMutation({
      entityId: 'item_1',
      op: 'item.setFull',
      args: { full: true },
      baseRevision: 1,
      mutationId: '10000000-0000-4000-8000-000000000001',
      catalogueRevision: 7,
    });
    const call = inventory.sync.mutations.mock.calls[0]?.[0];
    const mutation = call.mutations[0];
    expect(mutation.op).toBe('item.setFull');
    expect(mutation.entityId).toBe('item_1');
    expect(mutation.baseRevision).toBe(1);
    expect(mutation.catalogueRevision).toBe(7);
    expect(mutation.dependsOn).toEqual([]);
    expect(mutation.args).toEqual({ full: true });
    expect(mutation.mutationId).toBe('10000000-0000-4000-8000-000000000001');
    expect(Date.parse(mutation.clientTime)).toBeGreaterThanOrEqual(before);
  });

  it('mints a fresh mutation identity for callers that do not supply one', async () => {
    await sendItemMutation({
      entityId: 'item_1',
      op: 'item.setFull',
      args: { full: true },
      baseRevision: 1,
    });
    const mutation = inventory.sync.mutations.mock.calls[0]?.[0].mutations[0];
    expect(mutation.mutationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(mutation.catalogueRevision).toBeUndefined();
  });

  it('returns bad-request when the batch reports no outcome at all', async () => {
    inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [], highWaterSeq: 1 }));
    const result = await sendItemMutation({
      entityId: 'item_1',
      op: 'item.setFull',
      args: { full: true },
      baseRevision: 1,
    });
    expect(result.kind).toBe('bad-request');
  });

  it('passes a transport failure through untouched', async () => {
    inventory.sync.mutations.mockResolvedValue({ kind: 'unavailable', pillar: 'inventory' });
    const result = await sendItemMutation({
      entityId: 'item_1',
      op: 'item.setFull',
      args: { full: true },
      baseRevision: 1,
    });
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
