import { describe, expect, it, vi } from 'vitest';

import {
  isStaleChunkError,
  reloadForStaleChunk,
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

function deps(overrides: Partial<StaleChunkReloadDeps> = {}) {
  return {
    storage: memoryStorage(),
    reload: vi.fn(),
    now: () => 1_000_000,
    ...overrides,
  };
}

const webkit = new TypeError('Importing a module script failed.');

describe('isStaleChunkError', () => {
  it.each([
    ['WebKit', 'Importing a module script failed.'],
    ['Chromium', 'Failed to fetch dynamically imported module: https://x/finance-ui/A-1.js'],
    ['Gecko', 'error loading dynamically imported module: https://x/finance-ui/A-1.js'],
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

describe('reloadForStaleChunk', () => {
  it('reloads on a stale chunk and records when', () => {
    const storage = memoryStorage();
    const d = deps({ storage });
    expect(reloadForStaleChunk(webkit, d)).toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe('1000000');
  });

  it('does not reload for any other error', () => {
    const d = deps();
    expect(reloadForStaleChunk(new Error('boom'), d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('refuses a second reload inside the window, so a missing chunk cannot loop', () => {
    const lastReload = 1_000_000 - (STALE_CHUNK_RELOAD_WINDOW_MS - 1);
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(lastReload) }) });
    expect(reloadForStaleChunk(webkit, d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('reloads again once the window has passed, so the next deploy also recovers', () => {
    const lastReload = 1_000_000 - STALE_CHUNK_RELOAD_WINDOW_MS;
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(lastReload) }) });
    expect(reloadForStaleChunk(webkit, d)).toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('treats an unparseable stored value as no previous reload', () => {
    const d = deps({ storage: memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: 'garbage' }) });
    expect(reloadForStaleChunk(webkit, d)).toBe(true);
  });

  it('does not reload without storage, since nothing could stop a loop', () => {
    const d = deps({ storage: null });
    expect(reloadForStaleChunk(webkit, d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage throws', () => {
    const d = deps({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      },
    });
    expect(reloadForStaleChunk(webkit, d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });
});
