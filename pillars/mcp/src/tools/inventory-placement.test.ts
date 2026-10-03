import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { placementTools } = await import('./inventory-placement.js');

function tool(name: string) {
  const t = placementTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

const inventory = mockPillarInventory.inventory;

beforeEach(() => {
  vi.clearAllMocks();
  inventory.web.get.mockResolvedValue(callOk({ item: { id: 'item_1', revision: 3 } }));
  inventory.sync.mutations.mockResolvedValue(
    callOk({
      outcomes: [
        { mutationId: 'mut_1', status: 'applied', revision: 4, seq: 11, converged: false },
      ],
      highWaterSeq: 11,
    })
  );
});

describe('inventory.items.move', () => {
  it('fetches the current revision, then moves to a location as baseRevision', async () => {
    const result = await tool('inventory.items.move').handler({
      id: 'item_1',
      locationId: 'loc_1',
    });
    expect(inventory.web.get).toHaveBeenCalledWith({ id: 'item_1' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.move',
          entityId: 'item_1',
          baseRevision: 3,
          args: { to: { kind: 'location', locationId: 'loc_1' }, verb: 'move' },
        }),
      ],
    });
    expect(parseResult(result)).toEqual({
      itemId: 'item_1',
      outcome: {
        mutationId: 'mut_1',
        status: 'applied',
        revision: 4,
        seq: 11,
        converged: false,
      },
    });
    expect(result.isError).toBeUndefined();
  });

  it('rejects a missing id without calling the pillar', async () => {
    const result = await tool('inventory.items.move').handler({ locationId: 'loc_1' });
    expect(result.isError).toBe(true);
    expect(inventory.web.get).not.toHaveBeenCalled();
  });

  it('rejects a missing locationId without calling the pillar', async () => {
    const result = await tool('inventory.items.move').handler({ id: 'item_1' });
    expect(result.isError).toBe(true);
    expect(inventory.web.get).not.toHaveBeenCalled();
  });

  it('surfaces not-found from the revision fetch without sending a mutation', async () => {
    inventory.web.get.mockResolvedValue({ kind: 'not-found', pillar: 'inventory' });
    const result = await tool('inventory.items.move').handler({
      id: 'missing',
      locationId: 'loc_1',
    });
    expect(result.isError).toBe(true);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('returns a conflict outcome as an error result', async () => {
    const outcome = {
      mutationId: 'mut_1',
      status: 'conflict',
      kind: 'field',
      field: 'placement',
      mine: {},
      theirs: {},
    } as const;
    inventory.sync.mutations.mockResolvedValue(
      callOk({
        outcomes: [outcome],
        highWaterSeq: 11,
      })
    );
    const result = await tool('inventory.items.move').handler({
      id: 'item_1',
      locationId: 'loc_1',
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({ itemId: 'item_1', outcome });
  });

  it('surfaces pillar unavailability as an MCP tool error', async () => {
    inventory.web.get.mockResolvedValue(callUnavailable('inventory'));
    const result = await tool('inventory.items.move').handler({
      id: 'item_1',
      locationId: 'loc_1',
    });
    expect(result.isError).toBe(true);
  });

  it('surfaces a contract mismatch from the mutation call', async () => {
    inventory.sync.mutations.mockResolvedValue(
      callContractMismatch('inventory', 'sync.mutations', 'unknown')
    );
    const result = await tool('inventory.items.move').handler({
      id: 'item_1',
      locationId: 'loc_1',
    });
    expect(result.isError).toBe(true);
  });

  it.each([
    ['inventory.items.move', { id: 'item_1', locationId: 'loc_1' }],
    ['inventory.items.store', { id: 'item_1', containerId: 'box_1' }],
    ['inventory.items.pickUp', { id: 'item_1' }],
  ])('returns a rejected outcome from %s as an error result', async (name, args) => {
    const outcome = {
      mutationId: 'mut_1',
      status: 'rejected',
      reason: 'placement_invalid',
      message: 'x',
    } as const;
    inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [outcome], highWaterSeq: 11 }));

    const result = await tool(name).handler(args);

    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({ itemId: 'item_1', outcome });
  });

  it('returns a deferred outcome from move as an error result', async () => {
    const outcome = { mutationId: 'mut_1', status: 'deferred', waitingOn: 'abc' } as const;
    inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [outcome], highWaterSeq: 11 }));

    const result = await tool('inventory.items.move').handler({
      id: 'item_1',
      locationId: 'loc_1',
    });

    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({ itemId: 'item_1', outcome });
  });
});

describe('inventory.items.store', () => {
  it('rejects a missing containerId', async () => {
    const result = await tool('inventory.items.store').handler({ id: 'item_1' });
    expect(result.isError).toBe(true);
    expect(inventory.web.get).not.toHaveBeenCalled();
  });

  it('moves into a container with verb store', async () => {
    await tool('inventory.items.store').handler({ id: 'item_1', containerId: 'box_1' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.move',
          args: { to: { kind: 'container', itemId: 'box_1' }, verb: 'store' },
        }),
      ],
    });
  });
});

describe('inventory.items.pickUp', () => {
  it('moves into hand with verb pick_up', async () => {
    await tool('inventory.items.pickUp').handler({ id: 'item_1' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.move',
          args: { to: { kind: 'hand' }, verb: 'pick_up' },
        }),
      ],
    });
  });

  it('rejects a missing id', async () => {
    const result = await tool('inventory.items.pickUp').handler({});
    expect(result.isError).toBe(true);
  });
});
