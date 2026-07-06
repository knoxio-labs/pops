/**
 * Detection worker for orphaned `entity_id` references (issue #3615, CF009).
 *
 * The companion of the `budgets.owner_uri` reconciler (`reconcile-cross-pillar.ts`),
 * for the OTHER cross-pillar denormalisation finance carries: the contact id
 * copied onto `transactions`/`transaction_corrections`/`transaction_tag_rules`.
 * A contacts reseed (fresh ids by name) silently orphans those copies; nothing
 * else surfaces it. Each tick this worker fetches the live contact set and,
 * when contacts is reachable, counts the orphaned references and logs them so a
 * reseed is visible within a tick instead of festering until someone notices a
 * blank merchant in the UI.
 *
 * DETECTION ONLY — it never mutates. Per the finance-audit remediation policy
 * ("prod data repairs = reviewed one-off scripts with a mandatory pre-snapshot"),
 * the actual rewrite lives in `scripts/repair-orphaned-entity-ids.ts`, which
 * shares the same planner (`entityOrphansService.planEntityRepair`). This worker
 * only tells you a repair is due.
 *
 * Contacts-down safety: `fetchLiveEntities` returns an EMPTY set when contacts
 * is unreachable (the client degrades rather than throws). An empty live set
 * would flag EVERY finance reference as an orphan, so an empty fetch is treated
 * as "unavailable" and the tick is a no-op — never a false mass-orphan alarm.
 *
 * A recursive `setTimeout` arms the next tick only after the current resolves,
 * keeping the worker trivial to drive with `vi.useFakeTimers()`. `fetchLiveEntities`
 * is injected so tests need no HTTP transport; production wires the contacts
 * client's `fetchAllEntities`.
 */
import {
  entityOrphansService,
  type EntityRepairPlan,
  type FinanceDb,
  type LiveEntityRef,
  type OrphanRowCounts,
} from '../../db/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type FetchLiveEntitiesFn = () => Promise<LiveEntityRef[]>;

export interface EntityOrphanWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface EntityOrphanWorkerOptions {
  db: FinanceDb;
  fetchLiveEntities: FetchLiveEntitiesFn;
  intervalMs?: number;
  logger?: EntityOrphanWorkerLogger;
}

export interface EntityOrphanTickStats {
  /** True when the tick was a no-op because the live set was empty (contacts
   * unavailable) or the fetch threw — NOT because there were zero orphans. */
  skipped: boolean;
  /** Total orphaned reference rows across all three tables. */
  orphanRows: number;
  /** Distinct dead ids. */
  orphanIds: number;
  /** Distinct dead ids a repair could resolve by name right now. */
  repairable: number;
  /** Distinct dead ids with no usable name / no live match. */
  unmatched: number;
  /** Distinct dead ids with an ambiguous name (needs a human). */
  ambiguous: number;
}

export interface EntityOrphanWorkerHandle {
  stop: () => void;
  /** Run a single detection pass and return its stats. Exposed for tests and
   * for the boot script to fire an immediate pass before arming the timer. */
  runOnce: () => Promise<EntityOrphanTickStats>;
}

function skippedStats(): EntityOrphanTickStats {
  return { skipped: true, orphanRows: 0, orphanIds: 0, repairable: 0, unmatched: 0, ambiguous: 0 };
}

function buildTickStats(counts: OrphanRowCounts, plan: EntityRepairPlan): EntityOrphanTickStats {
  return {
    skipped: false,
    orphanRows: counts.transactions + counts.corrections + counts.tagRules,
    orphanIds: counts.distinctIds,
    repairable: plan.remap.size,
    unmatched: plan.unmatched.length,
    ambiguous: plan.ambiguous.length,
  };
}

function logOutcome(
  logger: EntityOrphanWorkerLogger | undefined,
  stats: EntityOrphanTickStats,
  counts: OrphanRowCounts,
  liveCount: number
): void {
  if (stats.orphanIds > 0) {
    logger?.warn?.(
      'finance entity_id orphans detected — run scripts/repair-orphaned-entity-ids.ts to fix',
      { ...stats, byTable: counts }
    );
    return;
  }
  logger?.info?.('finance entity-orphan sweep clean', { liveEntities: liveCount });
}

/** Fetch the live contact set, mapping both an outage (empty set) and a thrown
 * fetch to `null` — the caller treats `null` as "skip this tick" so an empty
 * set can never be mistaken for "everything is orphaned". */
async function fetchLiveOrSkip(
  fetchLiveEntities: FetchLiveEntitiesFn,
  logger: EntityOrphanWorkerLogger | undefined
): Promise<LiveEntityRef[] | null> {
  try {
    const live = await fetchLiveEntities();
    if (live.length > 0) return live;
    logger?.warn?.('finance entity-orphan sweep skipped — contacts returned an empty set');
    return null;
  } catch (err) {
    logger?.warn?.('finance entity-orphan fetch threw — skipping tick', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function runDetectionPass(
  db: FinanceDb,
  fetchLiveEntities: FetchLiveEntitiesFn,
  logger: EntityOrphanWorkerLogger | undefined
): Promise<EntityOrphanTickStats> {
  const live = await fetchLiveOrSkip(fetchLiveEntities, logger);
  if (live === null) return skippedStats();

  const liveIds = new Set(live.map((e) => e.id));
  const counts = entityOrphansService.countOrphanedRows(db, liveIds);
  const plan = entityOrphansService.planEntityRepair(db, live);
  const stats = buildTickStats(counts, plan);
  logOutcome(logger, stats, counts, live.length);
  return stats;
}

export function startReconcileEntityOrphansWorker(
  options: EntityOrphanWorkerOptions
): EntityOrphanWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const runOnce = (): Promise<EntityOrphanTickStats> =>
    runDetectionPass(options.db, options.fetchLiveEntities, logger);

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
      logger?.warn?.('finance entity-orphan tick failed', {
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
