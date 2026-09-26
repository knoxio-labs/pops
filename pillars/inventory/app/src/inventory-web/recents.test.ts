import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECENT_PLACEMENTS_KEY,
  RECENT_QUERIES_KEY,
  RECENT_RECORDS_KEY,
  recordOpened,
  recordPlacement,
  recordQuery,
  readRecentPlacements,
  readRecentQueries,
  readRecentRecords,
  useRecents,
} from './recents';

import type { FixedPlacement } from '../foundation/model/model';

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

let testStorage: TestStorage;

beforeEach(() => {
  testStorage = new TestStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => testStorage,
  });
  testStorage.clear();
});

describe('recent queries', () => {
  it('are trimmed, blank ones ignored, deduped case-insensitively and capped at 5', () => {
    for (const query of ['  Drill  ', 'lamp', 'cable', 'BOLT', 'shelf', 'tape', 'drill', '  ']) {
      recordQuery(query);
    }

    expect(readRecentQueries()).toEqual(['drill', 'tape', 'shelf', 'BOLT', 'cable']);
  });
});

describe('recent records', () => {
  it('dedupe by kind and id, newest first', () => {
    recordOpened({ kind: 'item', id: 'item-1' });
    recordOpened({ kind: 'location', id: 'location-1' });
    recordOpened({ kind: 'item', id: 'item-2' });
    recordOpened({ kind: 'item', id: 'item-1' });

    expect(readRecentRecords()).toEqual([
      { kind: 'item', id: 'item-1' },
      { kind: 'item', id: 'item-2' },
      { kind: 'location', id: 'location-1' },
    ]);
  });
});

describe('recent placements', () => {
  it('dedupe by kind and id, newest first, capped at 5', () => {
    const placements: FixedPlacement[] = [
      { kind: 'location', locationId: 'location-1' },
      { kind: 'container', containerId: 'container-1' },
      { kind: 'location', locationId: 'location-2' },
      { kind: 'container', containerId: 'container-2' },
      { kind: 'location', locationId: 'location-3' },
      { kind: 'container', containerId: 'container-3' },
      { kind: 'container', containerId: 'container-1' },
    ];
    placements.forEach(recordPlacement);

    expect(readRecentPlacements()).toEqual([
      { kind: 'container', containerId: 'container-1' },
      { kind: 'container', containerId: 'container-3' },
      { kind: 'location', locationId: 'location-3' },
      { kind: 'container', containerId: 'container-2' },
      { kind: 'location', locationId: 'location-2' },
    ]);
  });
});

it('a throwing localStorage yields empty recents and recording does not throw', () => {
  const access = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('SecurityError');
  });

  try {
    expect(readRecentQueries()).toEqual([]);
    expect(readRecentRecords()).toEqual([]);
    expect(readRecentPlacements()).toEqual([]);
    expect(() => recordQuery('lamp')).not.toThrow();
    expect(() => recordOpened({ kind: 'item', id: 'item-1' })).not.toThrow();
    expect(() => recordPlacement({ kind: 'location', locationId: 'location-1' })).not.toThrow();
  } finally {
    access.mockRestore();
  }
});

it('invalid JSON or a wrong-shaped entry is dropped and the rest kept', () => {
  window.localStorage.setItem(RECENT_QUERIES_KEY, '{not json');
  window.localStorage.setItem(
    RECENT_RECORDS_KEY,
    JSON.stringify([
      { kind: 'item', id: 'item-1' },
      { kind: 'item' },
      { kind: 'unknown', id: 'unknown-1' },
      { kind: 'location', id: 'location-1' },
    ])
  );
  window.localStorage.setItem(
    RECENT_PLACEMENTS_KEY,
    JSON.stringify([
      { kind: 'location', locationId: 'location-1' },
      { kind: 'in-hand' },
      { kind: 'container', containerId: 42 },
      { kind: 'container', containerId: 'container-1' },
    ])
  );

  expect(readRecentQueries()).toEqual([]);
  expect(readRecentRecords()).toEqual([
    { kind: 'item', id: 'item-1' },
    { kind: 'location', id: 'location-1' },
  ]);
  expect(readRecentPlacements()).toEqual([
    { kind: 'location', locationId: 'location-1' },
    { kind: 'container', containerId: 'container-1' },
  ]);
});

it('useRecents updates after recordPlacement in the same tab and on a storage event', () => {
  const { result, rerender } = renderHook(() => useRecents());
  const initial = result.current;

  rerender();
  expect(result.current).toBe(initial);

  act(() => {
    recordPlacement({ kind: 'location', locationId: 'location-1' });
  });
  expect(result.current.placements).toEqual([{ kind: 'location', locationId: 'location-1' }]);

  act(() => {
    window.localStorage.setItem(
      RECENT_PLACEMENTS_KEY,
      JSON.stringify([{ kind: 'container', containerId: 'container-1' }])
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: RECENT_PLACEMENTS_KEY,
        newValue: window.localStorage.getItem(RECENT_PLACEMENTS_KEY),
      })
    );
  });

  expect(result.current.placements).toEqual([{ kind: 'container', containerId: 'container-1' }]);
});
