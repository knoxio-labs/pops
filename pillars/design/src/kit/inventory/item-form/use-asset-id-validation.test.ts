import { describe, expect, it } from 'vitest';

import {
  findAssetIdConflict,
  nextAssetIdForPrefix,
  type TakenAssetId,
} from './use-asset-id-validation';

const taken: TakenAssetId[] = [
  { id: 'itm-tv', assetId: 'HI-0001', itemName: 'LG C4 65" OLED television' },
  { id: 'itm-laptop', assetId: 'HI-0002', itemName: 'MacBook Pro 16" M4 Max' },
];

describe('findAssetIdConflict', () => {
  it('returns null for an empty value', () => {
    expect(findAssetIdConflict('', undefined, taken)).toBeNull();
    expect(findAssetIdConflict('   ', undefined, taken)).toBeNull();
  });

  it('returns null for a value nothing else holds', () => {
    expect(findAssetIdConflict('HI-9999', undefined, taken)).toBeNull();
  });

  it('flags a value another item already holds', () => {
    expect(findAssetIdConflict('HI-0002', undefined, taken)).toBe(
      'Asset ID already in use by MacBook Pro 16" M4 Max'
    );
  });

  it('does not flag an item against its own asset id', () => {
    expect(findAssetIdConflict('HI-0002', 'itm-laptop', taken)).toBeNull();
  });

  it('still flags it when a different item is being edited', () => {
    expect(findAssetIdConflict('HI-0002', 'itm-tv', taken)).toBe(
      'Asset ID already in use by MacBook Pro 16" M4 Max'
    );
  });

  it('trims before comparing', () => {
    expect(findAssetIdConflict('  HI-0002  ', undefined, taken)).toBe(
      'Asset ID already in use by MacBook Pro 16" M4 Max'
    );
  });
});

describe('nextAssetIdForPrefix', () => {
  it('starts at 01 when nothing shares the prefix', () => {
    expect(nextAssetIdForPrefix('ELEC', taken)).toBe('ELEC01');
  });

  it('counts existing ids sharing the prefix', () => {
    expect(nextAssetIdForPrefix('HI', taken)).toBe('HI03');
  });

  it('switches to 3 digits at 100', () => {
    const many: TakenAssetId[] = Array.from({ length: 99 }, (_, i) => ({
      id: `itm-${i}`,
      assetId: `X${i}`,
      itemName: `Item ${i}`,
    }));
    expect(nextAssetIdForPrefix('X', many)).toBe('X100');
  });
});
