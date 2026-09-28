import { describe, expect, it } from 'vitest';

import { paletteScopeFromUrl } from './palette-url';

describe('palette URL ownership', () => {
  it('only reads the Purchases scope from the Search route', () => {
    expect(paletteScopeFromUrl('/inventory/search', '?scope=purchases')).toBe('purchases');
    expect(paletteScopeFromUrl('/inventory/search/', '?scope=purchases')).toBe('purchases');
    expect(paletteScopeFromUrl('/inventory/search', '?scope=inventory')).toBe('inventory');
    expect(paletteScopeFromUrl('/inventory/items/abc', '?scope=purchases')).toBe('inventory');
  });

  it('defaults malformed or absent scope values to Inventory', () => {
    expect(paletteScopeFromUrl('/inventory/search', '')).toBe('inventory');
    expect(paletteScopeFromUrl('/inventory/search', '?scope=other')).toBe('inventory');
  });
});
