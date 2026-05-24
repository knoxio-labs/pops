import { describe, expect, it, vi } from 'vitest';

import { mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { inventoryTools } = await import('./inventory.js');

describe('inventory.locations.tree', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.locations.tree')!;

  it('calls locations.tree.query and serialises the result', async () => {
    const result = await tool.handler({});
    expect(mockClient.inventory.locations.tree.query).toHaveBeenCalledWith();
    const parsed = parseResult(result) as { id: string }[];
    expect(parsed[0]).toMatchObject({ id: 'loc_1' });
  });
});

describe('inventory.locations.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.locations.list')!;

  it('calls locations.list.query', async () => {
    const result = await tool.handler({});
    expect(mockClient.inventory.locations.list.query).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });
});

describe('inventory.items.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.items.list')!;

  it('passes optional filters correctly', async () => {
    await tool.handler({ search: 'mac', locationId: 'loc_1', includeChildren: true, limit: 10 });
    expect(mockClient.inventory.items.list.query).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'mac',
        locationId: 'loc_1',
        includeChildren: true,
        limit: 10,
      })
    );
  });

  it('passes undefined for missing optional fields (not null)', async () => {
    await tool.handler({});
    const call = mockClient.inventory.items.list.query.mock.lastCall?.[0];
    expect(call).toBeDefined();
    for (const value of Object.values(call as Record<string, unknown>)) {
      expect(value).not.toBeNull();
    }
  });
});

describe('inventory.items.get', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.items.get')!;

  it('passes id to tRPC', async () => {
    const result = await tool.handler({ id: 'item_1' });
    expect(mockClient.inventory.items.get.query).toHaveBeenCalledWith({ id: 'item_1' });
    const parsed = parseResult(result) as { name: string };
    expect(parsed.name).toBe('MacBook');
  });

  it('returns isError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError for empty id', async () => {
    const result = await tool.handler({ id: '' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.connections.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.connections.list')!;

  it('passes itemId as required arg', async () => {
    await tool.handler({ itemId: 'item_1', limit: 20 });
    expect(mockClient.inventory.connections.listForItem.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', limit: 20 })
    );
  });

  it('returns isError for missing itemId', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.connections.graph', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.connections.graph')!;

  it('passes itemId and maxDepth', async () => {
    await tool.handler({ itemId: 'item_2', maxDepth: 2 });
    expect(mockClient.inventory.connections.graph.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_2', maxDepth: 2 })
    );
  });

  it('returns isError for missing itemId', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});
