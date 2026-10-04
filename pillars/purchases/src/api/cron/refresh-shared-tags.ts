import { replaceSharedTagCache } from '../../db/services/shared-tag-cache.js';

/**
 * Periodic refresh of Purchases' local copy of the shared tag vocabulary.
 *
 * The first read runs at boot and later passes run only after the previous
 * one settles. A failed or malformed read is reported and leaves the last
 * complete cache intact.
 */
import type { PurchasesDb } from '../../db/index.js';
import type { SharedTagFetch } from '../tags/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SharedTagCacheRefreshClient {
  fetchAll(): Promise<SharedTagFetch>;
}

export interface SharedTagCacheRefreshLogger {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
}

export interface SharedTagCacheRefreshOptions {
  db: PurchasesDb;
  client: SharedTagCacheRefreshClient;
  intervalMs?: number;
  logger?: SharedTagCacheRefreshLogger;
  now?: () => Date;
}

export type SharedTagCacheRefreshOutcome =
  | { readonly kind: 'refreshed'; readonly count: number }
  | Exclude<SharedTagFetch, { readonly kind: 'ok' }>;

export interface SharedTagCacheRefreshHandle {
  stop: () => void;
  runOnce: () => Promise<SharedTagCacheRefreshOutcome>;
  drain: () => Promise<void>;
}

async function refreshOnce(
  options: SharedTagCacheRefreshOptions,
  now: () => Date
): Promise<SharedTagCacheRefreshOutcome> {
  const result = await options.client.fetchAll();
  if (result.kind !== 'ok') {
    options.logger?.warn?.('purchases shared tag cache refresh skipped', {
      outcome: result.kind,
      ...(result.kind === 'unavailable' ? { reason: result.reason } : {}),
    });
    return result;
  }

  const count = replaceSharedTagCache(
    options.db,
    result.tags.map((tag) => ({
      tagId: tag.id,
      facet: tag.facet,
      name: tag.name,
      archived: tag.archived,
      mergedIntoId: tag.mergedIntoId,
    })),
    now().toISOString()
  );
  options.logger?.info?.('purchases shared tag cache refresh complete', { count });
  return { kind: 'refreshed', count };
}

function createScheduledRefresh(
  intervalMs: number,
  refresh: () => Promise<SharedTagCacheRefreshOutcome>,
  reportFailure: (error: unknown) => void
): SharedTagCacheRefreshHandle {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let inFlight: Promise<SharedTagCacheRefreshOutcome> | null = null;

  function runOnce(): Promise<SharedTagCacheRefreshOutcome> {
    if (inFlight !== null) return inFlight;
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  }

  async function tick(): Promise<void> {
    try {
      await runOnce();
    } catch (error) {
      reportFailure(error);
    }
    arm();
  }

  void tick();

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    runOnce,
    async drain(): Promise<void> {
      await inFlight?.catch(() => undefined);
    },
  };
}

/** Start an immediate vocabulary read, then refresh it once per day by default. */
export function startSharedTagCacheRefreshWorker(
  options: SharedTagCacheRefreshOptions
): SharedTagCacheRefreshHandle {
  const now = options.now ?? ((): Date => new Date());
  return createScheduledRefresh(
    options.intervalMs ?? DAY_MS,
    () => refreshOnce(options, now),
    (error) =>
      options.logger?.warn?.('purchases shared tag cache refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      })
  );
}
