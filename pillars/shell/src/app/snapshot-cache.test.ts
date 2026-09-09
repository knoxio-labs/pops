import { describe, expect, it, vi } from 'vitest';

import {
  cacheRegistrySnapshot,
  clearCachedRegistrySnapshot,
  readCachedRegistrySnapshot,
  SNAPSHOT_CACHE_KEY,
  type SnapshotStore,
} from './snapshot-cache';

import type { PillarSnapshot } from '@pops/pillar-sdk';

/**
 * The cache is the shell's floor once the bundle map has emptied, so the cases
 * that matter are the ones where it is asked to trust something it should not:
 * a value another deploy wrote, a value a browser refuses to hand over, a
 * value that is not JSON at all. None of them may fail a boot, and none may
 * produce a half-understood manifest that mounts and then breaks further in.
 */

function store(initial?: string): SnapshotStore & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, next) {
      this.value = next;
    },
    removeItem() {
      this.value = null;
    },
  };
}

function snapshotEntry(pillarId: string): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    registered: true,
    lastSeenAt: new Date('2026-09-09T00:00:00.000Z'),
    manifest: {
      pillar: pillarId,
      version: '0.1.0',
      contract: {
        package: `@pops/${pillarId}`,
        version: '0.1.0',
        tag: `contract-${pillarId}@v0.1.0`,
      },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
    },
  };
}

describe('cacheRegistrySnapshot', () => {
  it('writes a snapshot that can be read back', () => {
    const s = store();
    cacheRegistrySnapshot([snapshotEntry('finance')], s);
    expect(readCachedRegistrySnapshot(s).map((e) => e.pillarId)).toEqual(['finance']);
  });

  // Caching a snapshot that mounted nothing would replace a good floor with a
  // useless one. The caller only ever passes a resolved snapshot, and an empty
  // one is refused here as well so the two cannot disagree.
  it('refuses to overwrite a good entry with an empty snapshot', () => {
    const s = store();
    cacheRegistrySnapshot([snapshotEntry('finance')], s);
    cacheRegistrySnapshot([], s);
    expect(readCachedRegistrySnapshot(s)).toHaveLength(1);
  });

  it('overwrites on every successful boot, so an entry cannot go stale in place', () => {
    const s = store();
    cacheRegistrySnapshot([snapshotEntry('finance')], s);
    cacheRegistrySnapshot([snapshotEntry('media'), snapshotEntry('lists')], s);
    expect(readCachedRegistrySnapshot(s).map((e) => e.pillarId)).toEqual(['media', 'lists']);
  });

  // A full quota is not a reason to fail a boot that has otherwise succeeded.
  it('swallows a store that refuses the write', () => {
    const throwing: SnapshotStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(() => cacheRegistrySnapshot([snapshotEntry('finance')], throwing)).not.toThrow();
  });

  // A browser configured to block site data throws on the `localStorage`
  // property ACCESS, before any method is called — so the guard has to be
  // around the lookup, not only around the read. Driven through the ambient
  // default rather than an injected store, because that is the only path where
  // the lookup itself happens.
  it('boots when localStorage cannot be reached at all', () => {
    const access = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(() => cacheRegistrySnapshot([snapshotEntry('finance')])).not.toThrow();
      expect(readCachedRegistrySnapshot()).toEqual([]);
      expect(() => clearCachedRegistrySnapshot()).not.toThrow();
    } finally {
      access.mockRestore();
    }
  });
});

describe('readCachedRegistrySnapshot', () => {
  it('reads nothing from an empty store', () => {
    expect(readCachedRegistrySnapshot(store())).toEqual([]);
  });

  it('drops a value that is not JSON, rather than throwing', () => {
    const s = store('{not json');
    expect(readCachedRegistrySnapshot(s)).toEqual([]);
    expect(s.value).toBeNull();
  });

  it('drops a value that is JSON but not a list', () => {
    const s = store(JSON.stringify({ pillars: [] }));
    expect(readCachedRegistrySnapshot(s)).toEqual([]);
    expect(s.value).toBeNull();
  });

  // The value outlives deploys and anything on the origin can write it, so
  // "this code wrote it" is not a reason to trust its shape.
  it('drops an entry whose manifest no longer validates', () => {
    const stale = [{ pillarId: 'finance', manifest: { pillar: 'finance' } }];
    const s = store(JSON.stringify(stale));
    expect(readCachedRegistrySnapshot(s)).toEqual([]);
  });

  it('keeps the valid entries and drops the rest', () => {
    const mixed = [snapshotEntry('finance'), { pillarId: 'broken', manifest: { nope: true } }];
    const s = store(JSON.stringify(mixed));
    expect(readCachedRegistrySnapshot(s).map((e) => e.pillarId)).toEqual(['finance']);
  });

  it('drops an entry with no pillar id', () => {
    const s = store(JSON.stringify([{ manifest: snapshotEntry('finance').manifest }]));
    expect(readCachedRegistrySnapshot(s)).toEqual([]);
  });

  // A browser configured to block site data throws on access rather than
  // returning null, and the shell has to boot there too.
  it('survives a store that throws on read', () => {
    const throwing: SnapshotStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readCachedRegistrySnapshot(throwing)).toEqual([]);
  });

  it('reads from the versioned key', () => {
    const s = store();
    const setItem = vi.spyOn(s, 'setItem');
    cacheRegistrySnapshot([snapshotEntry('finance')], s);
    expect(setItem).toHaveBeenCalledWith(SNAPSHOT_CACHE_KEY, expect.any(String));
  });
});

describe('clearCachedRegistrySnapshot', () => {
  it('removes the entry', () => {
    const s = store();
    cacheRegistrySnapshot([snapshotEntry('finance')], s);
    clearCachedRegistrySnapshot(s);
    expect(readCachedRegistrySnapshot(s)).toEqual([]);
  });

  it('survives a store that throws on removal', () => {
    const throwing: SnapshotStore = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => clearCachedRegistrySnapshot(throwing)).not.toThrow();
  });
});
