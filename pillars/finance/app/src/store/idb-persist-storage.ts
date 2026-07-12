import type { PersistStorage, StorageValue } from 'zustand/middleware';

export interface IdbPersistStorageOptions {
  dbName: string;
  storeName: string;
  debounceMs?: number;
  maxAgeMs?: number;
  onWriteError?: () => void;
}

interface PersistEnvelope<S> {
  value: StorageValue<S>;
  savedAt: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function isEnvelope(record: unknown): record is { value: unknown; savedAt: number } {
  return (
    typeof record === 'object' &&
    record !== null &&
    'value' in record &&
    'savedAt' in record &&
    typeof record.savedAt === 'number'
  );
}

function isStorageValue(value: unknown): value is StorageValue<unknown> {
  return typeof value === 'object' && value !== null && 'state' in value;
}

class IdbPersistStorage<S> implements PersistStorage<S> {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingWrite: { name: string; value: StorageValue<S> } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private reportedWriteError = false;
  private flushListenersRegistered = false;

  constructor(private readonly options: IdbPersistStorageOptions) {}

  async getItem(name: string): Promise<StorageValue<S> | null> {
    try {
      const record = await this.enqueue(() => this.read(name));
      if (!isEnvelope(record)) return null;
      const { maxAgeMs } = this.options;
      if (maxAgeMs !== undefined && Date.now() - record.savedAt > maxAgeMs) {
        void this.enqueue(() => this.delete(name)).catch(() => undefined);
        return null;
      }
      if (!isStorageValue(record.value)) return null;
      // Written by setItem as a StorageValue<S> and round-tripped intact by IDB's
      // structured clone; this is the one narrow assertion at the deserialization
      // boundary (the same one JSON-based persist storages make after parse).
      return record.value as StorageValue<S>;
    } catch {
      return null;
    }
  }

  setItem(name: string, value: StorageValue<S>): void {
    this.registerFlushListeners();
    this.pendingWrite = { name, value };
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    // Trailing debounce: multi-MB import state would otherwise be serialized and
    // written on every click of a long classification session. Store updates
    // replace state rather than mutating it, so deferring the write is safe;
    // pagehide/hidden flush the tail.
    this.debounceTimer = setTimeout(
      () => this.flushPendingWrite(),
      this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    );
  }

  removeItem(name: string): void {
    this.cancelPendingWrite();
    void this.enqueue(() => this.delete(name)).catch((error: unknown) =>
      this.reportWriteError(error)
    );
  }

  private flushPendingWrite(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const write = this.pendingWrite;
    if (!write) return;
    this.pendingWrite = null;
    void this.enqueue(() =>
      this.write(write.name, { value: write.value, savedAt: Date.now() })
    ).catch((error: unknown) => this.reportWriteError(error));
  }

  private cancelPendingWrite(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingWrite = null;
  }

  private async read(name: string): Promise<unknown> {
    const store = await this.objectStore('readonly');
    return requestToPromise<unknown>(store.get(name));
  }

  private async write(name: string, envelope: PersistEnvelope<S>): Promise<void> {
    const store = await this.objectStore('readwrite');
    await requestToPromise(store.put(envelope, name));
  }

  private async delete(name: string): Promise<void> {
    const store = await this.objectStore('readwrite');
    await requestToPromise(store.delete(name));
  }

  private async objectStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.openDb();
    return db.transaction(this.options.storeName, mode).objectStore(this.options.storeName);
  }

  private openDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(this.options.storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error(`Failed to open IndexedDB "${this.options.dbName}"`));
      request.onblocked = () =>
        reject(new Error(`IndexedDB "${this.options.dbName}" open blocked by another connection`));
    });
    return this.dbPromise;
  }

  /**
   * Serializes every IDB operation on one promise chain so a removeItem enqueued
   * after in-flight setItems always lands last — clear-on-commit can never be
   * resurrected by a write that was already dispatched.
   */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private reportWriteError(error: unknown): void {
    if (this.reportedWriteError) return;
    this.reportedWriteError = true;
    console.warn('Persisting state to IndexedDB failed; progress will not be recoverable', error);
    this.options.onWriteError?.();
  }

  private registerFlushListeners(): void {
    if (this.flushListenersRegistered || typeof window === 'undefined') return;
    this.flushListenersRegistered = true;
    window.addEventListener('pagehide', () => this.flushPendingWrite());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushPendingWrite();
    });
  }
}

function createInertStorage<S>(): PersistStorage<S> {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

/**
 * A zustand `PersistStorage` over IndexedDB that stores the `StorageValue`
 * object directly via structured clone (no JSON round-trip), debounces writes,
 * expires records older than `maxAgeMs` at read time, and degrades to an inert
 * no-op storage when `indexedDB` is unavailable (jsdom, hostile private mode).
 * Reads resolve `null` and writes are swallowed on any backend failure — a
 * rejected rehydrate must never wedge the page gate.
 */
export function createIdbPersistStorage<S>(options: IdbPersistStorageOptions): PersistStorage<S> {
  if (typeof indexedDB === 'undefined') return createInertStorage<S>();
  return new IdbPersistStorage<S>(options);
}
