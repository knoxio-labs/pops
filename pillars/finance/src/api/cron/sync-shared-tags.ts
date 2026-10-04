/**
 * Reconcile Finance's local trip, hobby, and project vocabulary with the tags
 * pillar. Local tag strings remain stable across remote renames; this worker
 * only adds shared ids and mirrors archive state.
 */
import { type FinanceDb } from '../../db/index.js';
import { createTagsClient, type TagsClient } from '../tags/client.js';
import { runSharedTagSyncPass, type SharedTagSyncPassResult } from './sync-shared-tags-pass.js';

import type { SharedTagSyncStats } from './sync-shared-tags-pass.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export interface SharedTagSyncLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface SharedTagSyncOptions {
  db: FinanceDb;
  client?: TagsClient;
  intervalMs?: number;
  logger?: SharedTagSyncLogger;
}

export interface SharedTagSyncHandle {
  /** Stop future ticks and wait for the current pass before Finance closes its DB. */
  stop: () => Promise<void>;
  /** Run one pass now; concurrent calls share the same in-flight pass. */
  runOnce: () => Promise<SharedTagSyncStats>;
}

export type { SharedTagSyncStats } from './sync-shared-tags-pass.js';

function emptyStats(): SharedTagSyncStats {
  return { skipped: true, sharedTags: 0, linked: 0, conflicts: 0 };
}

function reportResult(
  result: SharedTagSyncPassResult,
  options: SharedTagSyncOptions,
  reportUnavailable: (reason: string) => SharedTagSyncStats,
  markAvailable: () => void
): SharedTagSyncStats {
  if (result.kind === 'unavailable') return reportUnavailable(result.reason);
  markAvailable();
  for (const conflict of result.conflicts) {
    options.logger?.warn?.('finance shared-tag link conflict', { conflict });
  }
  if (result.stats.linked > 0 || result.stats.conflicts > 0) {
    options.logger?.info?.('finance shared-tag sync complete', { ...result.stats });
  }
  return result.stats;
}

function createRunner(
  options: SharedTagSyncOptions,
  client: TagsClient
): { runOnce: () => Promise<SharedTagSyncStats>; waitForPass: () => Promise<void> } {
  let reportedUnavailable = false;
  let inFlight: Promise<SharedTagSyncStats> | null = null;

  function reportUnavailable(reason: string): SharedTagSyncStats {
    if (!reportedUnavailable) {
      reportedUnavailable = true;
      options.logger?.warn?.('finance shared-tag sync skipped — tags unavailable', { reason });
    }
    return emptyStats();
  }

  function markAvailable(): void {
    reportedUnavailable = false;
  }

  function runOnce(): Promise<SharedTagSyncStats> {
    if (inFlight !== null) return inFlight;
    const pass = runSharedTagSyncPass(options.db, client)
      .then((result) => reportResult(result, options, reportUnavailable, markAvailable))
      .catch((error: unknown) =>
        reportUnavailable(error instanceof Error ? error.message : String(error))
      )
      .finally(() => {
        inFlight = null;
      });
    inFlight = pass;
    return pass;
  }

  async function waitForPass(): Promise<void> {
    if (inFlight !== null) await inFlight;
  }

  return { runOnce, waitForPass };
}

/** Start the initial shared vocabulary pass and then repeat it on an interval. */
export function startSyncSharedTagsWorker(options: SharedTagSyncOptions): SharedTagSyncHandle {
  const runner = createRunner(options, options.client ?? createTagsClient());
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => void tick(), options.intervalMs ?? DEFAULT_INTERVAL_MS);
  }

  async function tick(): Promise<void> {
    await runner.runOnce();
    arm();
  }

  void tick();
  return {
    stop: async (): Promise<void> => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await runner.waitForPass();
    },
    runOnce: runner.runOnce,
  };
}
