import {
  clampTtl,
  createInitialState,
  describeError,
  MIN_CACHE_TTL_MS,
  REFRESH_LEAD_MS,
  toRegistrySnapshot,
  unrefTimer,
  type CacheConfig,
  type CacheState,
  type CachedSnapshot,
} from './cache-internals.js';
import { RegistryUnreachableError, type RegistrySnapshot } from './types.js';

import type { RegistryFetchResult } from './fetcher.js';

export {
  DEFAULT_REGISTRY_URL,
  DEFAULT_CACHE_TTL_MS,
  MIN_CACHE_TTL_MS,
  type CacheConfig,
  type RegistryFetcher,
  type WarnFn,
  type TimerHandle,
  type SetTimerFn,
  type ClearTimerFn,
} from './cache-internals.js';

let state: CacheState = createInitialState({});

export function configureCache(overrides: CacheConfig): void {
  cancelBackgroundTimer();
  state = createInitialState({
    registryUrl: overrides.registryUrl ?? state.config.registryUrl,
    ttlMs: overrides.ttlMs ?? state.config.ttlMs,
    fetcher: overrides.fetcher ?? state.config.fetcher,
    now: overrides.now ?? state.config.now,
    setTimeoutImpl: overrides.setTimeoutImpl ?? state.config.setTimeoutImpl,
    clearTimeoutImpl: overrides.clearTimeoutImpl ?? state.config.clearTimeoutImpl,
    onWarn: overrides.onWarn ?? state.config.onWarn,
  });
}

export function setRegistryUrl(url: string): void {
  state.config.registryUrl = url;
  invalidateRegistryCache();
}

export function setCacheTtlMs(ttlMs: number): void {
  state.config.ttlMs = clampTtl(ttlMs, state.config.onWarn);
  invalidateRegistryCache();
}

export function invalidateRegistryCache(): void {
  cancelBackgroundTimer();
  state.snapshot = null;
  state.seeded = false;
}

/**
 * Return the module to the state it had before anything configured it —
 * cached snapshot, in-flight fetch, failure counters AND configuration.
 *
 * The configuration half matters because this module is process-wide state and
 * every caller of this function is a test teardown. Clearing only the snapshot
 * left the registry origin, the injected fetcher and any fake clock installed
 * by {@link configureCache} in place, so a suite that configured the cache and
 * then "disposed" it handed the next test a client still pointed at a fixture
 * — and a later `pillarRegistry()` that forgot to configure would silently read
 * from the previous test's fetcher instead of failing.
 *
 * The timer is cancelled through the OUTGOING config on purpose. A fake clock
 * owns the handle it issued, so replacing `clearTimeoutImpl` first would leave
 * the timer armed against a clock nobody can advance.
 */
export function disposeDiscoveryClient(): void {
  cancelBackgroundTimer();
  state = createInitialState({});
}

export function seedSnapshot(snapshot: RegistrySnapshot): void {
  cancelBackgroundTimer();
  state.snapshot = {
    pillars: snapshot.pillars,
    fetchedAt: snapshot.fetchedAt,
    isStale: snapshot.source === 'stale-fallback',
  };
  state.inFlight = null;
  state.consecutiveFailures = 0;
  state.seeded = true;
}

export function queueFailures(count: number, error: Error): void {
  state.queuedFailures = { count, error };
}

export function getCurrentTtlMs(): number {
  return state.config.ttlMs;
}

export async function getRegistrySnapshot(): Promise<RegistrySnapshot> {
  const cached = state.snapshot;
  const now = state.config.now();

  if (cached !== null) {
    if (state.seeded) return toRegistrySnapshot(cached, 'cached', state.config.ttlMs);
    const age = now - cached.fetchedAt.getTime();
    if (!cached.isStale && age < state.config.ttlMs) {
      return toRegistrySnapshot(cached, 'cached', state.config.ttlMs);
    }
    if (cached.isStale) {
      return toRegistrySnapshot(cached, 'stale-fallback', state.config.ttlMs);
    }
  }

  const refreshed = await ensureInFlight();
  const source: RegistrySnapshot['source'] = refreshed.isStale ? 'stale-fallback' : 'fresh';
  return toRegistrySnapshot(refreshed, source, state.config.ttlMs);
}

function ensureInFlight(): Promise<CachedSnapshot> {
  if (state.inFlight !== null) return state.inFlight;
  const promise = doFetch();
  state.inFlight = promise;
  void promise.then(clearInFlight(promise), clearInFlight(promise));
  return promise;
}

function clearInFlight(promise: Promise<CachedSnapshot>): () => void {
  return () => {
    if (state.inFlight === promise) state.inFlight = null;
  };
}

async function doFetch(): Promise<CachedSnapshot> {
  const cachedBefore = state.snapshot;
  let lastError: unknown;

  try {
    const result = await invokeFetcher();
    return commitFreshSnapshot(result);
  } catch (err) {
    lastError = err;
    state.consecutiveFailures += 1;
  }

  if (cachedBefore !== null) return promoteToStale(cachedBefore, lastError);

  throw new RegistryUnreachableError(
    `discovery: registry at ${state.config.registryUrl} unreachable and no cache available`,
    { attempts: 1, cause: lastError }
  );
}

function commitFreshSnapshot(result: RegistryFetchResult): CachedSnapshot {
  const next: CachedSnapshot = {
    pillars: result.pillars,
    fetchedAt: new Date(state.config.now()),
    isStale: false,
  };
  state.snapshot = next;
  state.consecutiveFailures = 0;
  armBackgroundRefresh();
  return next;
}

function promoteToStale(previous: CachedSnapshot, error: unknown): CachedSnapshot {
  const stale: CachedSnapshot = { ...previous, isStale: true };
  state.snapshot = stale;
  state.config.onWarn('registry refresh failed; serving stale cache', {
    consecutiveFailures: state.consecutiveFailures,
    error: describeError(error),
  });
  armBackgroundRefresh();
  return stale;
}

async function invokeFetcher(): Promise<RegistryFetchResult> {
  const queued = state.queuedFailures;
  if (queued !== null && queued.count > 0) {
    queued.count -= 1;
    if (queued.count <= 0) state.queuedFailures = null;
    throw queued.error;
  }
  return state.config.fetcher(state.config.registryUrl);
}

function armBackgroundRefresh(): void {
  cancelBackgroundTimer();
  if (state.seeded) return;
  const delay = Math.max(state.config.ttlMs - REFRESH_LEAD_MS, MIN_CACHE_TTL_MS - REFRESH_LEAD_MS);
  state.backgroundTimer = state.config.setTimeoutImpl(() => {
    state.backgroundTimer = null;
    void runBackgroundRefresh();
  }, delay);
  unrefTimer(state.backgroundTimer);
}

async function runBackgroundRefresh(): Promise<void> {
  try {
    await ensureInFlight();
  } catch {
    // doFetch already promoted the cache to stale-fallback and logged.
  }
}

function cancelBackgroundTimer(): void {
  if (state.backgroundTimer !== null) {
    state.config.clearTimeoutImpl(state.backgroundTimer);
    state.backgroundTimer = null;
  }
}
