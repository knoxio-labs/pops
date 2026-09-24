import { describe, expect, it } from 'vitest';

import { INVENTORY_TRANSLATIONS } from './inventory-translations';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function inventoryKeysRead(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [path, source] of Object.entries(SOURCES)) {
    if (!source.includes("useTranslation('inventory')")) continue;
    for (const match of source.matchAll(/\bt\('([^']+)'/g)) {
      const key = match[1];
      if (key !== undefined) keys.set(key, path);
    }
  }
  return keys;
}

describe('INVENTORY_TRANSLATIONS', () => {
  it('finds the screens that read the inventory namespace', () => {
    expect(inventoryKeysRead().size).toBeGreaterThan(0);
  });

  it('carries every key those screens read', () => {
    const missing = [...inventoryKeysRead()]
      .filter(([key]) => !(key in INVENTORY_TRANSLATIONS))
      .map(([key, path]) => `${key} (${path})`);
    expect(missing).toEqual([]);
  });
});
