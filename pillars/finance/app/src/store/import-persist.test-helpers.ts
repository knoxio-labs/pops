import type { PersistStorage, StorageValue } from 'zustand/middleware';

export interface MemoryPersistStorage<S> extends PersistStorage<S> {
  dump(): StorageValue<S> | null;
}

/**
 * Map-backed, synchronous-resolve `PersistStorage` for tests. Inject per-test
 * via `useImportStore.persist.setOptions({ storage })` — a fresh instance per
 * test means zero cross-test bleed. Never import from production code.
 */
export function createMemoryPersistStorage<S>(): MemoryPersistStorage<S> {
  const records = new Map<string, StorageValue<S>>();
  return {
    getItem: (name) => records.get(name) ?? null,
    setItem: (name, value) => {
      records.set(name, value);
    },
    removeItem: (name) => {
      records.delete(name);
    },
    dump: () => [...records.values()][0] ?? null,
  };
}
