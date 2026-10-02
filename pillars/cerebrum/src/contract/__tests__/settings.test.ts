import { describe, expect, it } from 'vitest';

import { cerebrumManifest } from '../settings/index.js';
import { cerebrumKeyDefaults } from '../settings/key-defaults.js';

describe('cerebrum-contract settings manifests', () => {
  it('exposes cerebrumManifest with id "cerebrum"', () => {
    expect(cerebrumManifest.id).toBe('cerebrum');
    expect(cerebrumManifest.groups.length).toBeGreaterThan(0);
  });

  it('declares no ego.* key: nothing in the pillar reads one', () => {
    const egoKeys = [...cerebrumKeyDefaults.keys].filter((key) => key.startsWith('ego.'));
    expect(egoKeys).toEqual([]);
  });
});
