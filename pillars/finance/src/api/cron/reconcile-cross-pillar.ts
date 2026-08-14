/**
 * Nightly reconciliation worker for the finance pillar's cross-pillar
 * owner-URI denormalisation.
 *
 * For every distinct `owner_uri` currently stored on `budgets`, the worker
 * asks the registry pillar whether the URI still resolves (via
 * `registry.users.get`). On a "not-found" response the worker marks every
 * budgets row referencing the URI as stale (`owner_uri_stale_at = now`)
 * without deleting anything — existence is best-effort. Transient errors
 * (the registry is unavailable, the call times out, the SDK reports
 * `degraded`) are logged and the row is left untouched until the next tick.
 * URIs the registry rejects as malformed surface as `bad-uri`; they are
 * logged for ops and the row is preserved as well. A refused or absent
 * service-account credential surfaces as its own `unauthorized` outcome,
 * counted apart from `unavailable` — see `../pillars/outbound.ts`.
 *
 * A recursive `setTimeout` arms the next tick only after the current one
 * resolves, which also makes the worker trivial to drive with
 * `vi.useFakeTimers()` in tests. The fan-out call inside a tick is
 * sequential rather than parallel — production has at most a few thousand
 * distinct owner URIs per pillar and the periodic-cron contract prefers
 * predictable load against the owning pillar over a thundering herd.
 *
 * The worker is constructor-injected via a `lookupOwnerUri` function so
 * tests don't have to spin up an HTTP transport — production wires the
 * pillar SDK proxy at boot time; tests wire a stub.
 */
import { crossPillarService, type FinanceDb } from '../../db/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReconcileLookupResult =
  | { kind: 'ok' }
  | { kind: 'not-found' }
  | { kind: 'bad-uri'; reason: string }
  /**
   * The registry refused this pillar's service-account credential, or this
   * process had none to send. Preserved like `unavailable` — a pillar that
   * would not answer says nothing about whether the row exists — but
   * counted and logged apart from it, because waiting fixes an outage and
   * does not fix a grant.
   */
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'unavailable'; reason: string };

export type ReconcileLookupFn = (uri: string) => Promise<ReconcileLookupResult>;

export interface ReconcileWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ReconcileWorkerOptions {
  db: FinanceDb;
  lookupOwnerUri: ReconcileLookupFn;
  intervalMs?: number;
  logger?: ReconcileWorkerLogger;
  now?: () => Date;
}

export interface ReconcileTickStats {
  resolved: number;
  staleMarked: number;
  badUri: number;
  /**
   * The registry refused this pillar's credential, or this process held
   * none to send. Deliberately not folded into `unavailable`: a tick that
   * reports every URI unavailable reads as the registry being down and is
   * normally survivable, while the same tick reporting them unauthorized
   * means this pillar cannot reconcile at all until a grant or a key is
   * fixed — and it will keep saying so every night until someone does.
   */
  unauthorized: number;
  unavailable: number;
}

export interface ReconcileWorkerHandle {
  stop: () => void;
  /**
   * Run a single reconciliation pass synchronously and return the per-pass
   * stats. Exposed for integration tests and for the boot script to fire
   * an immediate pass before arming the timer.
   */
  runOnce: () => Promise<ReconcileTickStats>;
}

function emptyStats(): ReconcileTickStats {
  return { resolved: 0, staleMarked: 0, badUri: 0, unauthorized: 0, unavailable: 0 };
}

async function safeLookup(
  lookup: ReconcileLookupFn,
  uri: string,
  logger: ReconcileWorkerLogger | undefined
): Promise<ReconcileLookupResult> {
  try {
    return await lookup(uri);
  } catch (err) {
    logger?.warn?.('finance reconcile lookup threw', {
      uri,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'unavailable', reason: 'lookup-threw' };
  }
}

function applyOk(db: FinanceDb, uri: string, logger: ReconcileWorkerLogger | undefined): void {
  const cleared = crossPillarService.clearBudgetOwnerUriStale(db, uri);
  logger?.info?.('finance reconcile uri resolved', { uri, cleared });
}

function applyNotFound(
  db: FinanceDb,
  uri: string,
  now: Date,
  logger: ReconcileWorkerLogger | undefined
): void {
  const marked = crossPillarService.markBudgetOwnerUriStale(db, uri, now.toISOString());
  logger?.info?.('finance reconcile uri marked stale', { uri, marked });
}

interface ApplyResultContext {
  db: FinanceDb;
  uri: string;
  result: ReconcileLookupResult;
  now: Date;
  stats: ReconcileTickStats;
  logger: ReconcileWorkerLogger | undefined;
}

function applyResult(ctx: ApplyResultContext): void {
  const { db, uri, result, now, stats, logger } = ctx;
  if (result.kind === 'ok') {
    stats.resolved += 1;
    applyOk(db, uri, logger);
    return;
  }
  if (result.kind === 'not-found') {
    stats.staleMarked += 1;
    applyNotFound(db, uri, now, logger);
    return;
  }
  if (result.kind === 'bad-uri') {
    stats.badUri += 1;
    logger?.warn?.('finance reconcile bad uri (preserved for ops)', {
      uri,
      reason: result.reason,
    });
    return;
  }
  if (result.kind === 'unauthorized') {
    stats.unauthorized += 1;
    // The two reasons send an operator to different places — a grant to
    // widen versus a key to provision — so the headline says which rather
    // than leaving it to whoever reads the `reason` field.
    logger?.warn?.(credentialWarning(result.reason), { uri, reason: result.reason });
    return;
  }
  stats.unavailable += 1;
  if (result.reason === 'lookup-threw') return;
  logger?.warn?.('finance reconcile pillar unavailable', {
    uri,
    reason: result.reason,
  });
}

/**
 * The reason a credential outcome could not probe, as a headline.
 *
 * `no-credential` is this process holding no key at all — nothing was sent
 * and the registry has no opinion yet — which is a different job from a key
 * that was sent and refused.
 */
function credentialWarning(reason: string): string {
  return reason === 'no-credential'
    ? 'finance reconcile has no service-account key (preserved for ops)'
    : 'finance reconcile credential refused (preserved for ops)';
}

export function startReconcileCrossPillarWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const now = options.now ?? ((): Date => new Date());
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function runOnce(): Promise<ReconcileTickStats> {
    const stats = emptyStats();
    const uris = crossPillarService.listDistinctBudgetOwnerUris(options.db);
    for (const uri of uris) {
      const result = await safeLookup(options.lookupOwnerUri, uri, logger);
      applyResult({ db: options.db, uri, result, now: now(), stats, logger });
    }
    logger?.info?.('finance reconcile tick complete', { ...stats, count: uris.length });
    return stats;
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
    } catch (err) {
      logger?.warn?.('finance reconcile tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
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
  };
}
