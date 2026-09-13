/**
 * A dynamic `import()` whose file is gone rejects with a `TypeError` whose
 * message differs per engine, and nothing else identifies it. A deploy renames
 * every content-hashed chunk and deletes the old ones, so a tab still running
 * the previous build hits exactly this the next time it lazy-loads a screen.
 */
const STALE_CHUNK_MESSAGES = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
] as const;

/** sessionStorage key holding the epoch ms of the last stale-chunk reload. */
export const STALE_CHUNK_RELOAD_KEY = 'pops:stale-chunk-reload-at';

/**
 * How long after one reload another is refused. A window rather than a
 * one-shot flag, so a tab that recovers from one deploy still recovers from
 * the next; short enough that a chunk still missing after the reload shows the
 * error instead of looping.
 */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 30_000;

/** Side effects `reloadForStaleChunk` needs, injectable for tests. */
export interface StaleChunkReloadDeps {
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly reload: () => void;
  readonly now: () => number;
}

/**
 * Whether an error is a failed dynamic import of a module script.
 *
 * @param error Anything thrown or rejected.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return STALE_CHUNK_MESSAGES.some((message) => error.message.includes(message));
}

function browserDeps(): StaleChunkReloadDeps {
  let storage: Storage | null = null;
  try {
    storage = globalThis.sessionStorage;
  } catch {
    storage = null;
  }
  return { storage, reload: () => globalThis.location.reload(), now: Date.now };
}

/**
 * Reload the page once when `error` is a stale chunk, so the tab picks up the
 * current build instead of showing an error for a file the last deploy removed.
 *
 * Refuses (returns `false`) when the error is anything else, when a reload
 * already happened within `STALE_CHUNK_RELOAD_WINDOW_MS`, or when
 * sessionStorage is unusable, because without it a chunk that is genuinely
 * missing would reload forever.
 *
 * @param error The caught error.
 * @param deps Storage, reload and clock; the browser's by default.
 * @returns `true` when a reload was started and the caller should render nothing.
 */
export function reloadForStaleChunk(
  error: unknown,
  deps: StaleChunkReloadDeps = browserDeps()
): boolean {
  if (!isStaleChunkError(error) || deps.storage === null) return false;
  try {
    const last = Number(deps.storage.getItem(STALE_CHUNK_RELOAD_KEY));
    const now = deps.now();
    if (last > 0 && now - last < STALE_CHUNK_RELOAD_WINDOW_MS) return false;
    deps.storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}
