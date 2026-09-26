import { describe, expect, it } from 'vitest';

import {
  coreContainers,
  coreInventory,
  coreItem,
  coreLocations,
  coreWorld,
  television,
} from './core';

describe('core inventory fixtures', () => {
  it('indexes every named item, container, and location', () => {
    expect(coreWorld.items.size).toBe(coreInventory.length);
    expect(coreWorld.locations.size).toBe(coreLocations.length);
    expect(coreItem('itm-tv')).toBe(television);
  });

  it('fails loudly for an unknown item ID', () => {
    expect(() => coreItem('itm-missing')).toThrow('No core inventory item itm-missing');
  });

  it('keeps the named container population separate from ordinary items', () => {
    expect(coreContainers).toHaveLength(8);
    expect(coreContainers.every((entry) => entry.container !== null)).toBe(true);
  });
});
