import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: () => mockPillarInventory.inventory,
  __resetPillarClientForTests: () => {},
}));

const { locationTools } = await import('./inventory-locations.js');

function tool(name: string) {
  const t = locationTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

const locations = mockPillarInventory.inventory.locations;

beforeEach(() => {
  vi.clearAllMocks();
  locations.tree.mockResolvedValue(
    callOk({
      data: [{ id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0, children: [] }],
    })
  );
  locations.list.mockResolvedValue(
    callOk({
      data: [{ id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0 }],
      total: 1,
    })
  );
  locations.create.mockResolvedValue(
    callOk({
      data: { id: 'loc_2', name: 'Office', parentId: null, sortOrder: 1 },
      message: 'Location created',
    })
  );
  locations.update.mockResolvedValue(
    callOk({
      data: { id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0 },
      message: 'Location updated',
    })
  );
  locations.delete.mockResolvedValue(callOk({ message: 'Location deleted' }));
});

describe('inventory.locations.tree', () => {
  it('calls tree and unwraps CallResult', async () => {
    const result = await tool('inventory.locations.tree').handler({});
    expect(locations.tree).toHaveBeenCalled();
    expect(parseResult(result)).toEqual({
      data: [{ id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0, children: [] }],
    });
    expect(result.isError).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    locations.tree.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.locations.tree').handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    locations.tree.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    const result = await tool('inventory.locations.tree').handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.locations.list', () => {
  it('adds a stable URI to each location and preserves the count', async () => {
    const result = await tool('inventory.locations.list').handler({});
    expect(locations.list).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toEqual({
      data: [
        {
          id: 'loc_1',
          name: 'Living Room',
          parentId: null,
          sortOrder: 0,
          uri: 'pops:inventory/location/loc_1',
        },
      ],
      total: 1,
    });
  });
});

describe('inventory.locations.get', () => {
  it('gets a location by ID, adds its stable URI, and is read-only', async () => {
    const result = await tool('inventory.locations.get').handler({ id: 'loc_1' });

    expect(locations.get).toHaveBeenCalledWith({ id: 'loc_1' });
    expect(tool('inventory.locations.get').readOnly).toBe(true);
    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toEqual({
      data: {
        id: 'loc_1',
        name: 'Living Room',
        parentId: null,
        sortOrder: 0,
        uri: 'pops:inventory/location/loc_1',
      },
    });
  });

  it('requires a non-empty ID', async () => {
    const result = await tool('inventory.locations.get').handler({ id: '' });

    expect(result.isError).toBe(true);
    expect(locations.get).not.toHaveBeenCalled();
  });

  it('surfaces pillar failures', async () => {
    locations.get.mockResolvedValueOnce(callUnavailable('inventory'));
    expect((await tool('inventory.locations.get').handler({ id: 'loc_1' })).isError).toBe(true);

    locations.get.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    expect((await tool('inventory.locations.get').handler({ id: 'loc_1' })).isError).toBe(true);
  });
});

describe('inventory.locations.create', () => {
  it('creates a root location with name only', async () => {
    const result = await tool('inventory.locations.create').handler({ name: 'Office' });
    expect(locations.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Office' }));
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { data: { name: string }; message: string };
    expect(parsed.data.name).toBe('Office');
    expect(parsed.message).toBe('Location created');
  });

  it('passes parentId string', async () => {
    await tool('inventory.locations.create').handler({ name: 'Shelf', parentId: 'loc_1' });
    expect(locations.create).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'loc_1' }));
  });

  it('passes explicit null parentId', async () => {
    await tool('inventory.locations.create').handler({ name: 'Root', parentId: null });
    expect(locations.create).toHaveBeenCalledWith(expect.objectContaining({ parentId: null }));
  });

  it('passes sortOrder', async () => {
    await tool('inventory.locations.create').handler({ name: 'Bedroom', sortOrder: 2 });
    expect(locations.create).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 2 }));
  });

  it('returns isError when name is missing', async () => {
    const result = await tool('inventory.locations.create').handler({});
    expect(result.isError).toBe(true);
    expect(locations.create).not.toHaveBeenCalled();
  });

  it('returns isError when name is empty string', async () => {
    const result = await tool('inventory.locations.create').handler({ name: '' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on unavailable', async () => {
    locations.create.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.locations.create').handler({ name: 'Office' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.locations.update', () => {
  it('updates name only', async () => {
    const result = await tool('inventory.locations.update').handler({ id: 'loc_1', name: 'Den' });
    expect(locations.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'loc_1', data: { name: 'Den' } })
    );
    expect(result.isError).toBeUndefined();
  });

  it('sets parentId to a value', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_2', parentId: 'loc_1' });
    const call = locations.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.parentId).toBe('loc_1');
  });

  it('sets parentId to null (promote to root)', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_2', parentId: null });
    const call = locations.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.parentId).toBeNull();
  });

  it('does not include parentId when not provided', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_1', name: 'New Name' });
    const call = locations.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect('parentId' in call.data).toBe(false);
  });

  it('updates sortOrder', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_1', sortOrder: 5 });
    const call = locations.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.sortOrder).toBe(5);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.locations.update').handler({ name: 'No ID' });
    expect(result.isError).toBe(true);
    expect(locations.update).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    const result = await tool('inventory.locations.update').handler({ id: '' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.locations.delete', () => {
  it('deletes with force: false by default', async () => {
    const result = await tool('inventory.locations.delete').handler({ id: 'loc_1' });
    expect(locations.delete).toHaveBeenCalledWith({ id: 'loc_1', force: false });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { message: string };
    expect(parsed.message).toBe('Location deleted');
  });

  it('passes force: true', async () => {
    await tool('inventory.locations.delete').handler({ id: 'loc_1', force: true });
    expect(locations.delete).toHaveBeenCalledWith({ id: 'loc_1', force: true });
  });

  it('surfaces requiresConfirmation without isError', async () => {
    locations.delete.mockResolvedValueOnce(
      callOk({
        requiresConfirmation: true,
        stats: { childCount: 2, descendantCount: 5, itemCount: 3, totalItemCount: 10 },
      })
    );
    const result = await tool('inventory.locations.delete').handler({ id: 'loc_1' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { requiresConfirmation: boolean };
    expect(parsed.requiresConfirmation).toBe(true);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.locations.delete').handler({});
    expect(result.isError).toBe(true);
    expect(locations.delete).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.locations.delete').handler({ id: '' })).isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    locations.delete.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    const result = await tool('inventory.locations.delete').handler({ id: 'loc_1' });
    expect(result.isError).toBe(true);
  });
});
