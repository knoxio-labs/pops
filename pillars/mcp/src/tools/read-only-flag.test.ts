import { describe, expect, it } from 'vitest';

const { allTools } = await import('./index.js');

const byName = new Map(allTools.map((tool) => [tool.name, tool]));

describe('ToolDef.readOnly', () => {
  it('is set explicitly on every non-inventory tool', () => {
    const unset = allTools
      .filter((tool) => !tool.name.startsWith('inventory.'))
      .filter((tool) => typeof tool.readOnly !== 'boolean')
      .map((tool) => tool.name);
    expect(unset).toEqual([]);
  });

  it('marks the pairing-code tool as a write', () => {
    expect(byName.get('bfm.devicePairing.issueCode')?.readOnly).toBe(false);
  });

  it.each([
    'finance.transactions.list',
    'media.library.list',
    'cerebrum.search',
    'purchases.search',
  ])('marks %s as read-only', (name) => {
    expect(byName.get(name)?.readOnly).toBe(true);
  });
});
