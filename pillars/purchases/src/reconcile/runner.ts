/**
 * The three triggers, sharing one sweep.
 *
 * ADR-042 names them: purchase ingest, transaction commit, and a nightly
 * sweep. They are the same idempotent operation fired for different
 * reasons, so this file is scheduling and nothing else — all the behaviour
 * lives in `runSweep`.
 *
 * **Coalescing is the reason this exists rather than calling `runSweep`
 * directly from each trigger.** A backfill posts 748 orders in about a
 * second; a sweep per ingest would run 748 full reconciliations, each one
 * re-solving work the previous had just done and each one asking finance
 * for the same window. Requests inside one window collapse into a single
 * run, and a request arriving *during* a run schedules exactly one more —
 * so the last order in a burst is never left unswept.
 *
 * The transaction-commit trigger is a poll, not a push. Finance gets no
 * schema change and no webhook (ADR-042), and perpetual retry is already
 * how import lag is absorbed, so a timer is both sufficient and the only
 * option that leaves the producer untouched.
 */
import { runSweep, type SweepDeps, type SweepOutcome } from './sweep.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Burst window. Ingest requests arriving within it collapse into one run. */
const DEFAULT_COALESCE_MS = 5 * MINUTE_MS;

/**
 * How often to look for transactions imported since the last sweep.
 *
 * Fifteen minutes is deliberately unhurried: a purchase whose statement
 * has not arrived is a normal, permanent state, so there is nothing to be
 * gained by asking more often than a bank feed updates.
 */
const DEFAULT_POLL_MS = 15 * MINUTE_MS;

export interface SweepRunnerLogger {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
}

export interface SweepRunnerOptions extends SweepDeps {
  readonly coalesceMs?: number;
  readonly pollMs?: number;
  readonly nightlyMs?: number;
  readonly logger?: SweepRunnerLogger;
  /** Injectable timers so tests do not wait in real time. */
  readonly setTimeoutImpl?: (fn: () => void, ms: number) => NodeJS.Timeout;
  readonly clearTimeoutImpl?: (timer: NodeJS.Timeout) => void;
}

export interface SweepRunner {
  /**
   * Trigger 1 — something changed locally, sweep soon.
   *
   * Returns immediately. Callers are request handlers, and a reconciliation
   * must never be the reason a `POST /purchases` is slow or fails.
   */
  request(): void;
  /** Run one sweep now and await it. The explicit trigger, and what tests drive. */
  runOnce(): Promise<SweepOutcome>;
  /** Start triggers 2 and 3. */
  start(): void;
  stop(): void;
  /** Test-only: settle any in-flight run. */
  drain(): Promise<void>;
}

/** Timer bookkeeping, so `stop()` can actually stop everything. */
interface Scheduler {
  after: (ms: number, fn: () => void) => void;
  cancelAll: () => void;
  isStopped: () => boolean;
}

function createScheduler(options: SweepRunnerOptions): Scheduler {
  const arm = options.setTimeoutImpl ?? setTimeout;
  const disarm = options.clearTimeoutImpl ?? clearTimeout;
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;

  return {
    after(ms, fn) {
      if (stopped) return;
      const timer = arm(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
      // Never hold the process open for a reconciliation timer.
      timer.unref?.();
    },
    cancelAll() {
      stopped = true;
      for (const timer of timers) disarm(timer);
      timers.clear();
    },
    isStopped: () => stopped,
  };
}

/**
 * Serialise sweeps and remember whether one was asked for mid-run.
 *
 * Two sweeps at once would tear down and rewrite each other's links, and
 * dropping a concurrent request would leave the order that prompted it
 * unreconciled until the next timer. Neither is acceptable, so a request
 * during a run becomes exactly one follow-up run.
 */
function createGate(
  scheduler: Scheduler,
  logger: SweepRunnerLogger | undefined,
  sweep: () => Promise<SweepOutcome>
): { runOnce: () => Promise<SweepOutcome>; drain: () => Promise<void> } {
  let inFlight: Promise<SweepOutcome> | null = null;
  let again = false;

  async function runOnce(): Promise<SweepOutcome> {
    if (inFlight !== null) {
      again = true;
      return inFlight;
    }

    inFlight = sweep().finally(() => {
      inFlight = null;
    });

    try {
      const outcome = await inFlight;
      report(logger, outcome);
      return outcome;
    } catch (error) {
      logger?.warn?.('purchases sweep failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (again) {
        again = false;
        scheduler.after(0, () => void runOnce().catch(() => undefined));
      }
    }
  }

  return {
    runOnce,
    async drain(): Promise<void> {
      while (inFlight !== null) {
        await inFlight.catch(() => undefined);
      }
    },
  };
}

function report(logger: SweepRunnerLogger | undefined, outcome: SweepOutcome): void {
  if (outcome.kind === 'skipped') {
    logger?.info?.('purchases sweep skipped', { reason: outcome.reason });
    return;
  }
  logger?.info?.('purchases sweep complete', {
    chargesConsidered: outcome.chargesConsidered,
    derivedChargesMinted: outcome.derivedChargesMinted,
    linksTornDown: outcome.linksTornDown,
    linksWritten: outcome.linksWritten,
    review: outcome.review.length,
  });
}

export function createSweepRunner(options: SweepRunnerOptions): SweepRunner {
  const coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
  const scheduler = createScheduler(options);
  const gate = createGate(scheduler, options.logger, () => runSweep(options));

  /** A coalescing window is open; further requests are already covered. */
  let windowOpen = false;

  function fireAndForget(): void {
    void gate.runOnce().catch(() => undefined);
  }

  /** Re-arming rather than `setInterval`, so a slow sweep cannot pile up. */
  function tick(ms: number): void {
    scheduler.after(ms, () => {
      fireAndForget();
      tick(ms);
    });
  }

  return {
    request(): void {
      if (scheduler.isStopped() || windowOpen) return;
      windowOpen = true;
      scheduler.after(coalesceMs, () => {
        windowOpen = false;
        fireAndForget();
      });
    },

    runOnce: gate.runOnce,

    start(): void {
      // Trigger 2: transactions imported since the last look.
      tick(options.pollMs ?? DEFAULT_POLL_MS);
      // Trigger 3: the nightly sweep — the backstop for anything the other
      // two missed while the process was down.
      tick(options.nightlyMs ?? DAY_MS);
    },

    stop: scheduler.cancelAll,
    drain: gate.drain,
  };
}
