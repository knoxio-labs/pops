import { describe, expect, it } from 'vitest';

const { allTools } = await import('./index.js');

const byName = new Map(allTools.map((tool) => [tool.name, tool]));

const expectedWrites = [
  'bfm.devicePairing.issueCode',
  'inventory.catalogue.createDraft',
  'inventory.catalogue.patchDraft',
  'inventory.catalogue.publishDraft',
  'inventory.catalogue.abandonDraft',
  'inventory.connections.connect',
  'inventory.connections.disconnect',
  'inventory.fixtures.create',
  'inventory.fixtures.update',
  'inventory.fixtures.delete',
  'inventory.fixtures.connect',
  'inventory.fixtures.disconnect',
  'inventory.items.create',
  'inventory.items.update',
  'inventory.items.changeType',
  'inventory.items.setOverride',
  'inventory.items.clearOverride',
  'inventory.items.delete',
  'inventory.items.move',
  'inventory.items.store',
  'inventory.items.pickUp',
  'inventory.items.open',
  'inventory.items.close',
  'inventory.items.setFull',
  'inventory.items.discard',
  'inventory.items.restore',
  'inventory.locations.create',
  'inventory.locations.update',
  'inventory.locations.delete',
  'media.watchlist.add',
  'purchases.inventoryProposals.accept',
];

describe('ToolDef.readOnly', () => {
  it('is set explicitly on every tool', () => {
    const unset = allTools
      .filter((tool) => typeof tool.readOnly !== 'boolean')
      .map((tool) => tool.name);
    expect(unset).toEqual([]);
  });

  it('flags exactly the declared writes as not read-only', () => {
    const writes = allTools
      .filter((tool) => tool.readOnly === false)
      .map((tool) => tool.name)
      .toSorted();
    expect(writes).toEqual(expectedWrites.toSorted());
  });

  it('marks the pairing-code tool as a write', () => {
    expect(byName.get('bfm.devicePairing.issueCode')?.readOnly).toBe(false);
  });

  it('marks media.watchlist.add as a write', () => {
    expect(byName.get('media.watchlist.add')?.readOnly).toBe(false);
  });

  it.each([
    'finance.transactions.list',
    'finance.accounts.get',
    'media.library.list',
    'cerebrum.search',
    'purchases.search',
    'purchases.inventoryProposals.list',
  ])('marks %s as read-only', (name) => {
    expect(byName.get(name)?.readOnly).toBe(true);
  });
});
