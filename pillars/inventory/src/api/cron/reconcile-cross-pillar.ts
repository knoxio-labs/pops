import {
  pillar as serverPillar,
  PillarCallError,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/server';

/**
 * Cross-pillar URI reconciliation worker.
 *
 * Nightly job that walks the distinct `purchase_transaction_uri` values on
 * `home_inventory` and asks finance — via the typed `pillar()` proxy from
 * `@pops/pillar-sdk/server` — whether each reference still resolves.
 * Reconciliation outcomes:
 *
 *   - `ok`            → clear the corresponding `*_stale_at` column on
 *                       rows whose URI matches
 *   - `not-found`     → stamp `*_stale_at = now`. The row stays — existence
 *                       is best-effort
 *   - `unavailable`   → log + leave the row alone; retry next tick
 *   - `bad-request`   → log "bad URI" for ops + leave the row alone
 *
 * The next tick is armed only after the current one settles, so a slow
 * reconciliation cannot pile up overlapping runs.
 *
 * There is deliberately no `owner_uri` leg. That column has no writer and no
 * contract field that could name a user, so a leg over it could only ever walk
 * an empty list and report success — which is indistinguishable from a healthy
 * leg and is the failure this worker exists to detect, not to perform. The
 * column stays dormant until something can populate it.
 */
import { crossPillarUrisService, type InventoryDb } from '../../db/index.js';
import { reconcileUriBatch, type ReconcileLogger } from './reconcile-cross-pillar-runner.js';

/**
 * Opaque cross-pillar router type for the proxy. `@pops/finance` speaks REST
 * now, so there is no concrete router type to import — the proxy is fully
 * opaque (`unknown`); `PillarHandle<unknown>` resolves to a handle with no
 * procedure keys.
 */
export type FinanceRouter = unknown;

const DAY_MS = 24 * 60 * 60 * 1000;

export type { ReconcileLogger };

export interface ReconcileProxies {
  finance?: PillarHandle<FinanceRouter>;
}

export interface ReconcileWorkerOptions {
  db: InventoryDb;
  intervalMs?: number;
  logger?: ReconcileLogger;
  now?: () => number;
  proxies?: ReconcileProxies;
}

export interface ReconcileWorkerHandle {
  stop: () => void;
}

export interface ReconcileCounters {
  ok: number;
  notFound: number;
  unavailable: number;
  badUri: number;
}

interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

/**
 * Parse `pops://<pillar>/<type>/<id>`. Returns `null` for any shape that
 * isn't a well-formed soft reference — the caller treats those as bad URIs
 * (ops-visible warning, row preserved).
 */
export function parseSoftUri(uri: string): ParsedUri | null {
  const match = /^pops:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) return null;
  const [, pillar, type, id] = match;
  if (!pillar || !type || !id) return null;
  return { pillar, type, id };
}

function isCallResult(value: unknown): value is CallResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}

type ReconcileOutcome = 'ok' | 'not-found' | 'unavailable' | 'bad-request';

function classifyResult(value: unknown): ReconcileOutcome {
  if (isCallResult(value)) {
    if (value.kind === 'ok') return 'ok';
    if (value.kind === 'not-found') return 'not-found';
    // `refused` (e.g. a producer's own 413/422) is the same "the request as
    // sent will never succeed" fact `bad-request` already reports here.
    if (value.kind === 'bad-request' || value.kind === 'refused') return 'bad-request';
    return 'unavailable';
  }
  return 'ok';
}

function classifyError(err: unknown): ReconcileOutcome {
  if (err instanceof PillarCallError) {
    if (err.result.kind === 'not-found') return 'not-found';
    if (err.result.kind === 'bad-request' || err.result.kind === 'refused') return 'bad-request';
    return 'unavailable';
  }
  return 'unavailable';
}

async function safeCall<T>(fn: () => Promise<CallResult<T>>): Promise<ReconcileOutcome> {
  try {
    return classifyResult(await fn());
  } catch (err) {
    return classifyError(err);
  }
}

export async function runReconciliation(options: {
  db: InventoryDb;
  now?: () => number;
  logger?: ReconcileLogger;
  proxies?: ReconcileProxies;
}): Promise<ReconcileCounters> {
  const now = options.now ?? Date.now;
  const stampIso = new Date(now()).toISOString();
  const counters: ReconcileCounters = { ok: 0, notFound: 0, unavailable: 0, badUri: 0 };
  const db = options.db;

  const purchaseTransactionUris = crossPillarUrisService.listDistinctPurchaseTransactionUris(db);
  // Read before the early return. A work set that shrank because the writer
  // stopped deriving looks exactly like one that shrank because the data went
  // away, and only this count tells them apart.
  const missingUris = crossPillarUrisService.countRowsMissingPurchaseTransactionUri(db);
  if (missingUris > 0) {
    options.logger?.warn?.(
      'inventory cross-pillar reconciliation: rows name a finance transaction with no uri to reconcile',
      { rows: missingUris }
    );
  }

  // Nothing to resolve means nothing to say. A nightly "complete" line over an
  // empty work set is indistinguishable from one over a healthy one, and
  // constructing the proxy would demand a service-account key for a tick that
  // is not going to make a call.
  if (purchaseTransactionUris.length === 0) return counters;

  const finance = options.proxies?.finance ?? serverPillar<FinanceRouter>('finance');

  await reconcileUriBatch({
    db,
    logger: options.logger,
    counters,
    uris: purchaseTransactionUris,
    expectedPillar: 'finance',
    expectedType: 'transaction',
    parse: parseSoftUri,
    probe: (parsed, _uri) =>
      safeCall(() => finance.callDynamic('transactions', 'get', { id: parsed.id }, 'query')),
    onOk: (uri) => crossPillarUrisService.clearPurchaseTransactionUriStale(db, uri),
    onNotFound: (uri) => crossPillarUrisService.markPurchaseTransactionUriStale(db, uri, stampIso),
  });

  // The work-set size travels with the counters: totals alone cannot tell
  // "checked nothing" from "checked ten and all resolved".
  options.logger?.info?.('inventory cross-pillar reconciliation complete', {
    ...counters,
    purchaseTransactionUris: purchaseTransactionUris.length,
  });
  return counters;
}

export function startCrossPillarReconciliationWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const logger = options.logger;
  const now = options.now ?? Date.now;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    try {
      await runReconciliation({
        db: options.db,
        now,
        logger,
        proxies: options.proxies,
      });
    } catch (err) {
      logger?.warn?.('inventory cross-pillar reconciliation tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
