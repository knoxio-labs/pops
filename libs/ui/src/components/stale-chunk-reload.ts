/**
 * A dynamic `import()` whose file could not be loaded rejects with a
 * `TypeError` whose message differs per engine, and nothing else identifies
 * it. A deploy renames every content-hashed chunk and deletes the old ones, so
 * a tab still running the previous build hits exactly this the next time it
 * lazy-loads a screen. So does a tab whose module server is down, and only the
 * first is something a reload fixes.
 */
const STALE_CHUNK_MESSAGES = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
] as const;

/** Statuses that mean the file is gone rather than unreachable. */
const GONE_STATUSES: ReadonlySet<number> = new Set([404, 410]);

/** sessionStorage key holding the epoch ms of the last stale-chunk reload. */
export const STALE_CHUNK_RELOAD_KEY = 'pops:stale-chunk-reload-at';

/**
 * How long after one reload another is refused. A window rather than a
 * one-shot flag, so a tab that recovers from one deploy still recovers from
 * the next; short enough that a chunk still missing after the reload shows the
 * error instead of looping.
 */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 30_000;

/**
 * How long the staleness probe may take. A server that has not answered by
 * then is treated as down, so the fallback shows instead of a blank screen.
 */
export const STALE_CHUNK_PROBE_TIMEOUT_MS = 5_000;

/** The request the probe sends. */
export interface StaleChunkProbeInit {
  readonly method: 'HEAD';
  readonly cache: 'no-store';
  readonly signal: AbortSignal;
}

/** Side effects `reloadForStaleChunk` needs, injectable for tests. */
export interface StaleChunkReloadDeps {
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly reload: () => void;
  readonly now: () => number;
  /** Sends the staleness probe; the browser's `fetch` by default. */
  readonly fetch: (url: string, init: StaleChunkProbeInit) => Promise<Pick<Response, 'status'>>;
}

/** What the caller knows about where the failed module came from. */
export interface StaleChunkReloadOptions {
  /**
   * A URL the server hosting the failed module answers with 2xx whenever it
   * is up, such as that pillar's entry bundle. Probed only when the error
   * message names no URL, which is always the case in WebKit.
   */
  readonly probeUrl?: string;
}

/**
 * Whether an error is a failed dynamic import of a module script, whatever
 * the cause.
 *
 * @param error Anything thrown or rejected.
 */
export function isStaleChunkError(error: unknown): error is TypeError {
  if (!(error instanceof TypeError)) return false;
  return STALE_CHUNK_MESSAGES.some((message) => error.message.includes(message));
}

function httpUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function urlFromMessage(message: string): string | null {
  for (const prefix of STALE_CHUNK_MESSAGES) {
    const at = message.indexOf(prefix);
    if (at === -1) continue;
    return httpUrl(message.slice(at + prefix.length).replace(/^[\s:.]+/, ''));
  }
  return null;
}

async function probeStatus(url: string, deps: StaleChunkReloadDeps): Promise<number | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced rather than left to the abort signal alone, so a fetch that ignores
  // the signal still cannot keep the boundary blank.
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, STALE_CHUNK_PROBE_TIMEOUT_MS);
  });
  const answered = Promise.resolve()
    .then(() => deps.fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal }))
    .then(
      (response) => response.status,
      () => null
    );
  try {
    return await Promise.race([answered, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function reloadWindowOpen(deps: StaleChunkReloadDeps): boolean {
  if (deps.storage === null) return false;
  try {
    const last = Number(deps.storage.getItem(STALE_CHUNK_RELOAD_KEY));
    return !(last > 0 && deps.now() - last < STALE_CHUNK_RELOAD_WINDOW_MS);
  } catch {
    return false;
  }
}

function claimReload(deps: StaleChunkReloadDeps): boolean {
  if (deps.storage === null || !reloadWindowOpen(deps)) return false;
  try {
    deps.storage.setItem(STALE_CHUNK_RELOAD_KEY, String(deps.now()));
    return true;
  } catch {
    return false;
  }
}

async function buildIsStale(
  error: TypeError,
  options: StaleChunkReloadOptions,
  deps: StaleChunkReloadDeps
): Promise<boolean> {
  const failedUrl = urlFromMessage(error.message);
  if (failedUrl !== null) {
    const status = await probeStatus(failedUrl, deps);
    return status !== null && GONE_STATUSES.has(status);
  }
  if (options.probeUrl === undefined) return false;
  const status = await probeStatus(options.probeUrl, deps);
  if (status === null) return false;
  // Without the failed URL, the only question left is whether its server is
  // up. If it is, the import failed against a live server, which leaves a
  // file the deploy removed as the cause; a 5xx or no answer means it is not.
  return GONE_STATUSES.has(status) || (status >= 200 && status < 300);
}

function browserDeps(): StaleChunkReloadDeps {
  let storage: Storage | null = null;
  try {
    storage = globalThis.sessionStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    reload: () => globalThis.location.reload(),
    now: Date.now,
    fetch: (url, init) => globalThis.fetch(url, init),
  };
}

/**
 * Reload the page when `error` is a failed chunk import AND the build is
 * confirmed stale, so the tab picks up the current build instead of showing an
 * error for a file the last deploy removed.
 *
 * Staleness is decided by probing with a `HEAD`, `no-store` request bounded by
 * `STALE_CHUNK_PROBE_TIMEOUT_MS`:
 * - When the message names the failed URL (Chromium, Gecko), that URL is
 *   probed: 404 or 410 is stale; anything else, including 2xx, 5xx, a
 *   rejection or a timeout, is not.
 * - Otherwise (WebKit), `options.probeUrl` is probed: 2xx, 404 or 410 is
 *   stale; 5xx, a rejection or a timeout means the server is down. With no
 *   `probeUrl` there is no evidence, and nothing reloads.
 *
 * Refuses (resolves `false`) without probing when the error is anything else,
 * when a reload already happened within `STALE_CHUNK_RELOAD_WINDOW_MS`, or when
 * sessionStorage is unusable, because without it a chunk that is genuinely
 * missing would reload forever. The reload is recorded only when one starts.
 *
 * @param error The caught error.
 * @param options Where else to probe when the message carries no URL.
 * @param deps Storage, reload, clock and fetch; the browser's by default.
 * @returns `true` when a reload was started and the caller should keep
 *   rendering nothing; `false` when the caller should show its fallback.
 */
export async function reloadForStaleChunk(
  error: unknown,
  options: StaleChunkReloadOptions = {},
  deps: StaleChunkReloadDeps = browserDeps()
): Promise<boolean> {
  if (!isStaleChunkError(error) || !reloadWindowOpen(deps)) return false;
  if (!(await buildIsStale(error, options, deps)) || !claimReload(deps)) return false;
  deps.reload();
  return true;
}
