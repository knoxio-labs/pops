import { describe, expect, it } from 'vitest';

import { itemDetailId } from './palette-source';

describe('inventory palette source URL context', () => {
  it('uses only the exact item-detail route for This item commands', () => {
    expect(itemDetailId('/inventory/items/item-1')).toBe('item-1');
    expect(itemDetailId('/inventory/items/item%2F1')).toBe('item/1');
    expect(itemDetailId('/inventory/items')).toBeNull();
    expect(itemDetailId('/inventory/items/item-1/edit')).toBeNull();
  });

  it('rejects malformed encoded item ids', () => {
    expect(itemDetailId('/inventory/items/%E0%A4%A')).toBeNull();
  });
});
