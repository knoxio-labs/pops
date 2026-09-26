import { describe, expect, it } from 'vitest';

import {
  CODE_PATTERN_KEY,
  CODE_PATTERN_RULE,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from '../settings/code-pattern.js';
import { inventoryManifest } from '../settings/index.js';

describe('inventoryManifest', () => {
  it('still loads with id "inventory"', () => {
    expect(inventoryManifest.id).toBe('inventory');
  });

  it('declares code suggestions with their defaults and rule', () => {
    const codes = inventoryManifest.groups.find((group) => group.id === 'codes');
    expect(codes?.fields).toEqual([
      expect.objectContaining({ key: SUGGEST_CODES_KEY, default: 'true' }),
      expect.objectContaining({
        key: CODE_PATTERN_KEY,
        default: DEFAULT_CODE_PATTERN,
        validation: expect.objectContaining({ pattern: CODE_PATTERN_RULE }),
      }),
    ]);
  });
});
