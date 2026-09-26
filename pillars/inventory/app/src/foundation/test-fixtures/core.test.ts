import { describe, expect, it } from 'vitest';

import {
  coreContainers,
  coreInventory,
  coreItem,
  coreLocations,
  coreTypes,
  coreWorld,
  electronicsType,
  television,
} from './core';

describe('core inventory fixtures', () => {
  it('indexes every named item, container, and location', () => {
    expect(coreInventory).toHaveLength(46);
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

  it('covers the published field kinds with typed fixture definitions', () => {
    expect(coreTypes).toHaveLength(9);
    expect(electronicsType.fields.map((field) => field.kind)).toEqual([
      'short_text',
      'long_text',
      'integer',
      'decimal',
      'boolean',
      'enum',
      'measurement',
      'date',
      'date_time',
      'url',
      'reference',
      'decimal',
    ]);
  });
});
