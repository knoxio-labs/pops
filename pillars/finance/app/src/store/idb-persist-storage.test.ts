import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIdbPersistStorage } from './idb-persist-storage';

import type { PersistStorage, StorageValue } from 'zustand/middleware';

interface TestState {
  step: number;
  label: string;
}

const KEY = 'wizard';

function makeStorage(
  overrides: Partial<{ debounceMs: number; maxAgeMs: number; onWriteError: () => void }> = {}
): PersistStorage<TestState> {
  return createIdbPersistStorage<TestState>({
    dbName: 'test-db',
    storeName: 'records',
    ...overrides,
  });
}

function value(step: number, label = 'x'): StorageValue<TestState> {
  return { state: { step, label }, version: 1 };
}

/** Starts the read, then drains fake timers (fake-indexeddb schedules its work on them). */
async function drainedGet(
  storage: PersistStorage<TestState>,
  name = KEY
): Promise<StorageValue<TestState> | null> {
  const pending = storage.getItem(name);
  await vi.runAllTimersAsync();
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createIdbPersistStorage', () => {
  it('round-trips a StorageValue through IndexedDB', async () => {
    const storage = makeStorage();
    storage.setItem(KEY, value(3, 'hello'));
    await vi.runAllTimersAsync();

    expect(await drainedGet(storage)).toEqual(value(3, 'hello'));
  });

  it('returns null for a key that was never written', async () => {
    expect(await drainedGet(makeStorage())).toBeNull();
  });

  it('coalesces rapid setItem calls into one write keeping the last value', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    const storage = makeStorage();

    storage.setItem(KEY, value(1));
    storage.setItem(KEY, value(2));
    storage.setItem(KEY, value(3));
    await vi.runAllTimersAsync();

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(await drainedGet(storage)).toEqual(value(3));
  });

  it('removeItem cancels a pending debounced write', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    const storage = makeStorage();

    storage.setItem(KEY, value(1));
    storage.removeItem(KEY);
    await vi.runAllTimersAsync();

    expect(putSpy).not.toHaveBeenCalled();
    expect(await drainedGet(storage)).toBeNull();
  });

  it('a removeItem issued while a put is in flight still wins (op queue ordering)', async () => {
    const storage = makeStorage();

    storage.setItem(KEY, value(1));
    vi.advanceTimersToNextTimer();
    storage.setItem(KEY, value(2));
    storage.removeItem(KEY);
    await vi.runAllTimersAsync();

    expect(await drainedGet(storage)).toBeNull();
  });

  it('expires records older than maxAgeMs and deletes the key', async () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    const storage = makeStorage({ maxAgeMs: 1000 });
    storage.setItem(KEY, value(1));
    await vi.runAllTimersAsync();

    vi.setSystemTime(new Date('2026-07-01T00:00:02Z'));
    expect(await drainedGet(storage)).toBeNull();
    expect(await drainedGet(storage)).toBeNull();

    const rawStorage = makeStorage();
    expect(await drainedGet(rawStorage)).toBeNull();
  });

  it('keeps records younger than maxAgeMs', async () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    const storage = makeStorage({ maxAgeMs: 60_000 });
    storage.setItem(KEY, value(5));
    await vi.runAllTimersAsync();

    vi.setSystemTime(new Date('2026-07-01T00:00:30Z'));
    expect(await drainedGet(storage)).toEqual(value(5));
  });

  it('degrades to an inert storage when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = makeStorage();

    storage.setItem(KEY, value(1));
    expect(vi.getTimerCount()).toBe(0);
    expect(await storage.getItem(KEY)).toBeNull();
    expect(() => storage.removeItem(KEY)).not.toThrow();
  });

  it('flushes a pending write on pagehide', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    const storage = makeStorage();

    storage.setItem(KEY, value(9));
    window.dispatchEvent(new Event('pagehide'));
    await vi.runAllTimersAsync();

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(await drainedGet(storage)).toEqual(value(9));
  });

  it('flushes a pending write when the document becomes hidden', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    const storage = makeStorage();

    storage.setItem(KEY, value(7));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runAllTimersAsync();

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(await drainedGet(storage)).toEqual(value(7));
  });

  it('swallows write errors and invokes onWriteError exactly once', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onWriteError = vi.fn();
    const storage = makeStorage({ onWriteError });

    storage.setItem(KEY, value(1));
    await vi.runAllTimersAsync();
    storage.setItem(KEY, value(2));
    await vi.runAllTimersAsync();

    expect(putSpy).toHaveBeenCalledTimes(2);
    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
