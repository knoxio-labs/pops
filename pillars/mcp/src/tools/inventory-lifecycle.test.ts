import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, mockPillarInventory, parseResult, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { lifecycleTools } = await import('./inventory-lifecycle.js');

function tool(name: string) {
  const t = lifecycleTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

const inventory = mockPillarInventory.inventory;

beforeEach(() => {
  vi.clearAllMocks();
  inventory.web.get.mockResolvedValue(callOk({ item: { id: 'item_1', revision: 5 } }));
  inventory.sync.mutations.mockResolvedValue(
    callOk({
      outcomes: [
        { mutationId: 'mut_1', status: 'applied', revision: 6, seq: 20, converged: false },
      ],
      highWaterSeq: 20,
    })
  );
});

describe('inventory.items.open / close', () => {
  it('opens with baseRevision from the current item', async () => {
    await tool('inventory.items.open').handler({ id: 'item_1' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.setAccess',
          entityId: 'item_1',
          baseRevision: 5,
          args: { access: 'open' },
        }),
      ],
    });
  });

  it('closes', async () => {
    await tool('inventory.items.close').handler({ id: 'item_1' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [expect.objectContaining({ op: 'item.setAccess', args: { access: 'closed' } })],
    });
  });

  it('rejects a missing id', async () => {
    const result = await tool('inventory.items.open').handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.items.setFull', () => {
  it('sends full: true', async () => {
    await tool('inventory.items.setFull').handler({ id: 'item_1', full: true });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [expect.objectContaining({ op: 'item.setFull', args: { full: true } })],
    });
  });

  it('sends full: false (a literal false is not a missing field)', async () => {
    await tool('inventory.items.setFull').handler({ id: 'item_1', full: false });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [expect.objectContaining({ op: 'item.setFull', args: { full: false } })],
    });
  });

  it('rejects a missing full', async () => {
    const result = await tool('inventory.items.setFull').handler({ id: 'item_1' });
    expect(result.isError).toBe(true);
    expect(inventory.web.get).not.toHaveBeenCalled();
  });
});

describe('inventory.items.discard', () => {
  it('sends lifecycle discarded with a reason', async () => {
    await tool('inventory.items.discard').handler({ id: 'item_1', reason: 'broken' });
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.setLifecycle',
          args: { lifecycle: 'discarded', reason: 'broken' },
        }),
      ],
    });
  });

  it('omits reason entirely when not given, rather than sending it as undefined', async () => {
    await tool('inventory.items.discard').handler({ id: 'item_1' });
    const call = inventory.sync.mutations.mock.calls[0]?.[0];
    expect(call.mutations[0].args).toEqual({ lifecycle: 'discarded' });
  });

  it('rejects a missing id', async () => {
    const result = await tool('inventory.items.discard').handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.items.restore', () => {
  it('sends item.restoreDeleted with no revision fetch', async () => {
    await tool('inventory.items.restore').handler({ id: 'item_1' });
    expect(inventory.web.get).not.toHaveBeenCalled();
    expect(inventory.sync.mutations).toHaveBeenCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.restoreDeleted',
          entityId: 'item_1',
          baseRevision: null,
          args: {},
        }),
      ],
    });
  });

  it('surfaces a rejected outcome (e.g. destroyed items cannot be restored) as data', async () => {
    inventory.sync.mutations.mockResolvedValue(
      callOk({
        outcomes: [
          {
            mutationId: 'mut_1',
            status: 'rejected',
            reason: 'illegal_transition',
            message: 'a destroyed item cannot be restored',
          },
        ],
        highWaterSeq: 20,
      })
    );
    const result = await tool('inventory.items.restore').handler({ id: 'item_1' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { status: string };
    expect(parsed.status).toBe('rejected');
  });

  it('rejects a missing id', async () => {
    const result = await tool('inventory.items.restore').handler({});
    expect(result.isError).toBe(true);
  });
});
