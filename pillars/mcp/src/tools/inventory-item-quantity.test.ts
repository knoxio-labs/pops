import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({ getPillar: pillarMockGetter }));

const { itemTools } = await import('./inventory-items.js');
const quantityTool = itemTools.find((tool) => tool.name === 'inventory.items.setQuantity');
if (quantityTool === undefined) throw new Error('Quantity tool is not registered');

const inventory = mockPillarInventory.inventory;
const MUTATION_ID = '30000000-0000-4000-8000-000000000001';
const input = { id: 'screws', revision: 7, quantity: 40, mutationId: MUTATION_ID };
const applied = {
  mutationId: MUTATION_ID,
  status: 'applied',
  revision: 8,
  seq: 10,
  converged: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [applied], highWaterSeq: 10 }));
});

describe('inventory.items.setQuantity', () => {
  it.each([1, 40])(
    'sends absolute count %i at the observed revision and preserves retry identity',
    async (quantity) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await quantityTool.handler({ ...input, quantity });
        expect(result.isError).toBeFalsy();
        expect(parseResult(result)).toEqual({ itemId: input.id, outcome: applied });
      }
      expect(inventory.sync.mutations).toHaveBeenCalledTimes(2);
      for (const call of inventory.sync.mutations.mock.calls) {
        expect(call[0]).toEqual({
          mutations: [
            {
              mutationId: MUTATION_ID,
              entityId: input.id,
              op: 'item.setQuantity',
              args: { quantity },
              baseRevision: 7,
              dependsOn: [],
              clientTime: expect.any(String),
            },
          ],
        });
      }
      expect(inventory.web.get).not.toHaveBeenCalled();
    }
  );

  it('generates a mutation identity when none is supplied', async () => {
    await quantityTool.handler({ id: input.id, revision: 7, quantity: 2 });
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      mutationId: expect.any(String),
      args: { quantity: 2 },
    });
  });

  it.each([undefined, null, 0, -1, 1.5, '2', true, NaN, Infinity])(
    'rejects invalid quantity %s before dispatch',
    async (quantity) => {
      const result = await quantityTool.handler({ ...input, quantity });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Missing or invalid required field: quantity',
      });
      expect(inventory.sync.mutations).not.toHaveBeenCalled();
    }
  );

  it.each([
    { id: '' },
    { id: undefined },
    { revision: undefined },
    { revision: 0 },
    { revision: 1.5 },
    { revision: '7' },
    { mutationId: 'invalid' },
  ])('rejects invalid command metadata %j before dispatch', async (patch) => {
    expect((await quantityTool.handler({ ...input, ...patch })).isError).toBe(true);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it.each([
    { mutationId: MUTATION_ID, status: 'conflict', kind: 'field', serverRevision: 8 },
    {
      mutationId: MUTATION_ID,
      status: 'rejected',
      reason: 'quantity_container_conflict',
      message: 'Containers must have quantity 1',
    },
    {
      mutationId: MUTATION_ID,
      status: 'rejected',
      reason: 'target_missing',
      message: 'Item not found',
    },
    { mutationId: MUTATION_ID, status: 'deferred', waitingOn: 'previous-mutation' },
  ])('returns a non-applied outcome as a tool error: %j', async (outcome) => {
    inventory.sync.mutations.mockResolvedValueOnce(
      callOk({ outcomes: [outcome], highWaterSeq: 10 })
    );
    const result = await quantityTool.handler(input);
    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({ itemId: input.id, outcome });
    expect(inventory.sync.mutations).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable pillar without retrying', async () => {
    inventory.sync.mutations.mockResolvedValueOnce(callUnavailable('inventory'));
    expect((await quantityTool.handler(input)).isError).toBe(true);
    expect(inventory.sync.mutations).toHaveBeenCalledTimes(1);
  });
});
