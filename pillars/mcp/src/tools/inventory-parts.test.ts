import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, mockPillarInventory, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { partTools } = await import('./inventory-parts.js');

function tool(name: string) {
  const found = partTools.find((entry) => entry.name === name);
  if (!found) throw new Error(`Tool not found: ${name}`);
  return found;
}

const items = mockPillarInventory.inventory.items;
const VIEW = { canHaveParts: true, assembly: null, parts: [{ itemId: 'cup' }] };

beforeEach(() => {
  vi.clearAllMocks();
  items.getParts.mockResolvedValue(callOk({ data: VIEW }));
  items.addPart.mockResolvedValue(callOk({ data: VIEW }));
  items.removePart.mockResolvedValue(callOk({ data: VIEW }));
});

describe('inventory.parts.list', () => {
  it('reads the parts of the given item', async () => {
    const result = await tool('inventory.parts.list').handler({ itemId: 'kit' });
    expect(items.getParts).toHaveBeenCalledWith({ itemId: 'kit' });
    expect(result.isError).toBeFalsy();
  });

  it('refuses a missing itemId without calling the pillar', async () => {
    expect((await tool('inventory.parts.list').handler({})).isError).toBe(true);
    expect(items.getParts).not.toHaveBeenCalled();
  });

  it('surfaces an unavailable pillar as an error', async () => {
    items.getParts.mockResolvedValueOnce(callUnavailable('inventory'));
    expect((await tool('inventory.parts.list').handler({ itemId: 'kit' })).isError).toBe(true);
  });
});

describe.each([
  ['inventory.parts.add', () => items.addPart],
  ['inventory.parts.remove', () => items.removePart],
])('%s', (name, call) => {
  it('passes the assembly and part ids flat', async () => {
    await tool(name).handler({ itemId: 'kit', partItemId: 'cup' });
    expect(call()).toHaveBeenCalledWith({ itemId: 'kit', partItemId: 'cup' });
  });

  it.each([{ partItemId: 'cup' }, { itemId: 'kit' }, { itemId: '', partItemId: 'cup' }])(
    'refuses %o without calling the pillar',
    async (args) => {
      expect((await tool(name).handler(args)).isError).toBe(true);
      expect(call()).not.toHaveBeenCalled();
    }
  );

  it('is a write', () => {
    expect(tool(name).readOnly).toBe(false);
  });
});
