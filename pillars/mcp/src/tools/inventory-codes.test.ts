import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, mockPillarInventory, pillarMockGetter } from './test-helpers.js';

import type { ServerPillarOptions } from '@pops/pillar-sdk/server';

const getPillarMock = vi.hoisted(() =>
  vi.fn<(pillarId: string, options?: ServerPillarOptions) => unknown>()
);

vi.mock('../pillar-client.js', () => ({
  getPillar: getPillarMock,
  __resetPillarClientForTests: () => {},
}));

const { codeSuggestTool } = await import('./inventory-codes.js');

const suggest = mockPillarInventory.inventory.codes.suggest;

function text(result: Awaited<ReturnType<typeof codeSuggestTool.handler>>): string {
  const [first] = result.content;
  return first?.type === 'text' ? first.text : '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getPillarMock.mockImplementation((pillarId: string) => pillarMockGetter(pillarId));
  suggest.mockResolvedValue(callOk({ suggestions: ['BOX-OFFICE-5', 'BOX-HOME-1'] }));
});

describe('inventory.codes.suggest', () => {
  it('is read-only and declares the inventory codes scope', () => {
    expect(codeSuggestTool.readOnly).toBe(true);
    expect(codeSuggestTool.scope).toBe('inventory.codes.suggest');
  });

  it('forwards the item, type, destination and stem, and returns the suggestions', async () => {
    const result = await codeSuggestTool.handler({
      itemName: ' Office 5 ',
      typeKey: 'storage_box',
      containerId: 'shelves',
      stem: 'BOX-',
    });

    expect(result.isError).toBeUndefined();
    expect(suggest).toHaveBeenCalledWith({
      name: 'Office 5',
      typeKey: 'storage_box',
      containerId: 'shelves',
      stem: 'BOX-',
    });
    expect(JSON.parse(text(result))).toEqual({ suggestions: ['BOX-OFFICE-5', 'BOX-HOME-1'] });
  });

  it('sends the inventory protocol header the codes route requires', async () => {
    await codeSuggestTool.handler({ itemName: 'Lamp' });

    const options = getPillarMock.mock.calls.at(-1)?.[1];
    expect(options?.extraHeaders?.()).toEqual({ 'pops-inventory-protocol': '3' });
  });

  it.each([
    [{}, 'itemName is required'],
    [{ itemName: '   ' }, 'itemName is required'],
    [{ itemName: 'Lamp', typeKey: '' }, 'Invalid field: typeKey'],
    [{ itemName: 'Lamp', stem: 'BK4' }, 'must not end in a digit'],
    [{ itemName: 'Lamp', locationId: 'a', containerId: 'b' }, 'not both'],
  ])('refuses %j without calling inventory', async (args, message) => {
    const result = await codeSuggestTool.handler(args);

    expect(result.isError).toBe(true);
    expect(text(result)).toContain(message);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('names the scope to grant when inventory refuses the credential', async () => {
    suggest.mockResolvedValue({ kind: 'unauthorized', pillar: 'inventory', message: 'nope' });

    const result = await codeSuggestTool.handler({ itemName: 'Lamp' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('inventory.codes.suggest');
  });
});
