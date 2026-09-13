import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isStaleChunkError,
  reloadForStaleChunk,
  STALE_CHUNK_PROBE_TIMEOUT_MS,
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  type StaleChunkReloadDeps,
} from './stale-chunk-reload';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function answering(status: number) {
  return vi.fn<StaleChunkReloadDeps['fetch']>(() => Promise.resolve({ status }));
}

function deps(overrides: Partial<StaleChunkReloadDeps> = {}) {
  return {
    storage: memoryStorage(),
    reload: vi.fn(),
    now: () => 1_000_000,
    fetch: answering(404),
    ...overrides,
  };
}

const CHUNK_URL = 'https://pops.example/finance-ui/ImportPage-abc123.js';
const ENTRY_URL = 'https://pops.example/media-ui/media.js?v=probe';
const webkit = new TypeError('Importing a module script failed.');
const chromium = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK_URL}`);
const gecko = new TypeError(`error loading dynamically imported module: ${CHUNK_URL}`);

afterEach(() => {
  vi.useRealTimers();
});

describe('isStaleChunkError', () => {
  it.each([
    ['WebKit', webkit.message],
    ['Chromium', chromium.message],
    ['Gecko', gecko.message],
  ])('recognises the %s message', (_engine, message) => {
    expect(isStaleChunkError(new TypeError(message))).toBe(true);
  });

  it('ignores a TypeError about something else', () => {
    expect(
      isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'x')"))
    ).toBe(false);
  });

  it('ignores the same message on an Error that is not a TypeError', () => {
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(false);
  });

  it('ignores non-errors', () => {
    expect(isStaleChunkError('Importing a module script failed.')).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe('reloadForStaleChunk — the failed URL is in the message', () => {
  it.each([
    ['Chromium', chromium],
    ['Gecko', gecko],
  ])('probes the %s URL with an uncached HEAD', async (_engine, error) => {
    const d = deps();
    await reloadForStaleChunk(error, { probeUrl: ENTRY_URL }, d);
    expect(d.fetch).toHaveBeenCalledOnce();
    expect(d.fetch).toHaveBeenCalledWith(
      CHUNK_URL,
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' })
    );
  });

  it.each([404, 410])('reloads when the chunk answers %i and records when', async (status) => {
    const storage = memoryStorage();
    const d = deps({ storage, fetch: answering(status) });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe('1000000');
  });

  it.each([502, 503, 500])('does not reload when the chunk answers %i', async (status) => {
    const storage = memoryStorage();
    const d = deps({ storage, fetch: answering(status) });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('does not reload when the chunk exists, even with a live probe URL', async () => {
    const d = deps({ fetch: answering(200) });
    await expect(reloadForStaleChunk(chromium, { probeUrl: ENTRY_URL }, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('falls back to the probe URL when the message carries something that is not a URL', async () => {
    const d = deps({ fetch: answering(200) });
    const error = new TypeError('Failed to fetch dynamically imported module: not a url');
    await expect(reloadForStaleChunk(error, { probeUrl: ENTRY_URL }, d)).resolves.toBe(true);
    expect(d.fetch).toHaveBeenCalledWith(ENTRY_URL, expect.anything());
  });
});

describe('reloadForStaleChunk — WebKit, no URL in the message', () => {
  it('reloads when the probe URL answers 2xx, since the server is up', async () => {
    const d = deps({ fetch: answering(200) });
    await expect(reloadForStaleChunk(webkit, { probeUrl: ENTRY_URL }, d)).resolves.toBe(true);
    expect(d.fetch).toHaveBeenCalledWith(ENTRY_URL, expect.anything());
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('reloads when the probe URL answers 404', async () => {
    const d = deps({ fetch: answering(404) });
    await expect(reloadForStaleChunk(webkit, { probeUrl: ENTRY_URL }, d)).resolves.toBe(true);
  });

  it.each([502, 504])('does not reload when the probe URL answers %i', async (status) => {
    const d = deps({ fetch: answering(status) });
    await expect(reloadForStaleChunk(webkit, { probeUrl: ENTRY_URL }, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('does not reload or probe without a probe URL', async () => {
    const d = deps();
    await expect(reloadForStaleChunk(webkit, {}, d)).resolves.toBe(false);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe('reloadForStaleChunk — a probe that fails', () => {
  it('does not reload when the probe rejects', async () => {
    const d = deps({ fetch: vi.fn(() => Promise.reject(new TypeError('Load failed'))) });
    await expect(reloadForStaleChunk(webkit, { probeUrl: ENTRY_URL }, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('does not reload when fetch throws synchronously', async () => {
    const d = deps({
      fetch: vi.fn(() => {
        throw new TypeError('Illegal invocation');
      }),
    });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('gives up after the timeout, aborting a probe that never answers', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const d = deps({
      fetch: vi.fn((_url, init) => {
        signal = init.signal;
        return new Promise<never>(() => undefined);
      }),
    });
    const verdict = reloadForStaleChunk(webkit, { probeUrl: ENTRY_URL }, d);

    await vi.advanceTimersByTimeAsync(STALE_CHUNK_PROBE_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(verdict).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe('reloadForStaleChunk — the loop guard', () => {
  it('does not probe or reload for any other error', async () => {
    const d = deps();
    await expect(reloadForStaleChunk(new Error('boom'), { probeUrl: ENTRY_URL }, d)).resolves.toBe(
      false
    );
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('refuses a second reload inside the window without probing', async () => {
    const lastReload = 1_000_000 - (STALE_CHUNK_RELOAD_WINDOW_MS - 1);
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(lastReload) }) });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('reloads again once the window has passed, so the next deploy also recovers', async () => {
    const lastReload = 1_000_000 - STALE_CHUNK_RELOAD_WINDOW_MS;
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(lastReload) }) });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('refuses when another boundary claimed the window while this one probed', async () => {
    const storage = memoryStorage();
    const d = deps({
      storage,
      fetch: vi.fn(() => {
        storage.setItem(STALE_CHUNK_RELOAD_KEY, '999999');
        return Promise.resolve({ status: 404 });
      }),
    });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('treats an unparseable stored value as no previous reload', async () => {
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: 'garbage' }) });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(true);
  });

  it('does not probe or reload without storage, since nothing could stop a loop', async () => {
    const d = deps({ storage: null });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage throws', async () => {
    const d = deps({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      },
    });
    await expect(reloadForStaleChunk(chromium, {}, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });
});
