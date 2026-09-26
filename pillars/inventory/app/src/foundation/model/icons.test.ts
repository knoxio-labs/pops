import { Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { INVENTORY_ICONS } from './icons';

describe('INVENTORY_ICONS', () => {
  it('maps every concept to an icon', () => {
    expect(Object.keys(INVENTORY_ICONS)).toHaveLength(27);
    expect(
      Object.values(INVENTORY_ICONS).every(
        (icon) => typeof icon === 'object' || typeof icon === 'function'
      )
    ).toBe(true);
  });

  it('never uses a Sparkles icon', () => {
    expect(Object.values(INVENTORY_ICONS)).not.toContain(Sparkles);
  });
});
