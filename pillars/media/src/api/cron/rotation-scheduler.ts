/**
 * In-process rotation-cycle scheduler: a recursive `setTimeout` driven by a
 * MODULE-LEVEL singleton controller, mirroring `plex-scheduler.ts`. The
 * `server.ts` boot path and the REST `/rotation/scheduler/{toggle,run-now}`
 * handlers all drive the SAME timer, and the next tick is armed only AFTER the
 * current cycle resolves (no pile-up). One immediate tick fires on `start`.
 *
 * `rotation_cron_expression` drives the timer: each arm parses it and waits
 * until the next occurrence in the process's local timezone. The fixed
 * INTERVAL (env `MEDIA_ROTATION_INTERVAL_MS`, default daily) is the fallback
 * used only when that expression is unparseable, so a corrupt setting degrades
 * to periodic runs rather than stopping the engine. An unset or blank
 * expression falls back to the default cron, not the interval.
 *
 * Persisted state lives in `rotation_settings` (`rotation_enabled` +
 * `rotation_cron_expression`); `resumeIfEnabled` reads it on boot.
 * `stopForShutdown` clears the timer WITHOUT persisting the disabled flag —
 * a SIGTERM must not read back as the operator switching rotation off.
 */
import { type MediaDb, rotationLogService, rotationSettingsService } from '../../db/index.js';
import { getRotationCyclePolicy } from '../modules/rotation-cycle-policy.js';
import { emptyResult } from '../modules/rotation-cycle-types.js';
import { executeRotationCycle } from '../modules/rotation-cycle.js';
import { resolveArmDelayMs, type ScheduledRun, scheduleAt } from './cron-timer.js';

const ENABLED_KEY = 'rotation_enabled';
const CRON_KEY = 'rotation_cron_expression';
const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

export interface RotationSchedulerStatus {
  isRunning: boolean;
  isCycleRunning: boolean;
  intervalMs: number;
  cronExpression: string;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  nextRunAt: string | null;
}

interface SchedulerState {
  db: MediaDb;
  intervalMs: number;
  cronExpression: string;
  timer: ScheduledRun | undefined;
}

let state: SchedulerState | null = null;
let currentCycle: Promise<void> | null = null;
let isCycleRunning = false;
let lastCycleAt: string | null = null;
let lastCycleError: string | null = null;
let nextRunAt: string | null = null;

function resolveDefaultIntervalMs(): number {
  const raw = process.env['MEDIA_ROTATION_INTERVAL_MS'];
  if (raw === undefined || raw === '') return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

/**
 * The expression to arm from: explicit option, then the stored setting, else
 * the default. A blank stored value is treated as unset — `cron-parser` reads
 * an empty string as `* * * * *`, so honouring it would run a full Radarr
 * cycle every minute.
 */
function resolveCronExpression(db: MediaDb, override?: string): string {
  const candidate = override ?? rotationSettingsService.get(db, CRON_KEY) ?? DEFAULT_CRON;
  return candidate.trim() === '' ? DEFAULT_CRON : candidate;
}

function persistEnabled(db: MediaDb, cronExpression: string): void {
  rotationSettingsService.set(db, ENABLED_KEY, 'true');
  rotationSettingsService.set(db, CRON_KEY, cronExpression);
}

function persistDisabled(db: MediaDb): void {
  rotationSettingsService.set(db, ENABLED_KEY, 'false');
}

/**
 * Run one cycle, writing exactly one `rotation_log` row. A concurrent call
 * (cycle already running) writes a skipped row and returns without re-entering
 * the cycle (single-flight guard).
 */
async function runCycle(db: MediaDb): Promise<void> {
  if (isCycleRunning) {
    const policy = getRotationCyclePolicy(db);
    rotationLogService.writeCycleLog(db, {
      ...emptyResult(policy.targetFreeGb),
      skippedReason: 'Concurrent cycle already running',
    });
    return;
  }

  isCycleRunning = true;
  try {
    const result = await executeRotationCycle(db);
    rotationLogService.writeCycleLog(db, result);
    lastCycleAt = new Date().toISOString();
    lastCycleError = result.skippedReason;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastCycleAt = new Date().toISOString();
    lastCycleError = `Cycle error: ${message}`;
    const policy = getRotationCyclePolicy(db);
    rotationLogService.writeCycleLog(db, {
      ...emptyResult(policy.targetFreeGb),
      skippedReason: lastCycleError,
    });
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Run a cycle while publishing it as `currentCycle`, so `waitForCycleEnd` can
 * await an in-flight Radarr mutation instead of the process exiting under it.
 */
async function trackCycle(db: MediaDb): Promise<void> {
  const cycle = runCycle(db);
  currentCycle = cycle;
  try {
    await cycle;
  } finally {
    if (currentCycle === cycle) currentCycle = null;
  }
}

function arm(): void {
  if (state === null) return;
  const current = state;
  const targetMs = Date.now() + resolveArmDelayMs(current.cronExpression, current.intervalMs);
  nextRunAt = new Date(targetMs).toISOString();
  current.timer = scheduleAt(targetMs, () => {
    void tick();
  });
}

async function tick(): Promise<void> {
  if (state === null) return;
  const current = state;
  try {
    await trackCycle(current.db);
  } catch (err) {
    console.warn('[media-api] rotation scheduler tick failed', err);
  }
  arm();
}

export interface RotationSchedulerStartOptions {
  db: MediaDb;
  intervalMs?: number;
  cronExpression?: string;
}

export const rotationScheduler = {
  /**
   * Arm the recursive timer + fire one cycle immediately. Idempotent: a second
   * `start` clears the prior timer and re-arms with the new options. Persists
   * the enabled flag + cron expression to `rotation_settings`.
   */
  start(options: RotationSchedulerStartOptions): RotationSchedulerStatus {
    state?.timer?.cancel();
    const cronExpression = resolveCronExpression(options.db, options.cronExpression);
    state = {
      db: options.db,
      intervalMs: options.intervalMs ?? resolveDefaultIntervalMs(),
      cronExpression,
      timer: undefined,
    };
    persistEnabled(options.db, cronExpression);
    void tick();
    return rotationScheduler.status(options.db);
  },

  /** Clear the timer + persist the disabled flag. No-op if not running. */
  stop(db: MediaDb): RotationSchedulerStatus {
    state?.timer?.cancel();
    persistDisabled(db);
    state = null;
    nextRunAt = null;
    return rotationScheduler.status(db);
  },

  /** Run a single cycle directly (no timer arming). Writes a rotation log. */
  async runOnce(db: MediaDb): Promise<void> {
    await trackCycle(db);
  },

  /**
   * Clear the timer WITHOUT persisting the disabled flag, for process
   * shutdown. `stop` is the operator switching rotation off and must persist;
   * a SIGTERM is not, and persisting there would leave every restarted
   * container with rotation silently disabled.
   */
  stopForShutdown(): void {
    state?.timer?.cancel();
    state = null;
    nextRunAt = null;
  },

  /**
   * Resolve once the in-flight cycle settles, or after `timeoutMs`. Returns
   * `true` when the cycle drained, `false` when the bound elapsed first — the
   * caller decides whether to proceed with a partial Radarr mutation in flight.
   */
  async waitForCycleEnd(timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS): Promise<boolean> {
    const inflight = currentCycle;
    if (inflight === null) return true;
    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref();
    });
    try {
      return await Promise.race([inflight.then(() => true), expiry]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  },

  /** Start with the persisted cron if `rotation_enabled` is `'true'`. */
  resumeIfEnabled(db: MediaDb): RotationSchedulerStatus | null {
    if (rotationSettingsService.get(db, ENABLED_KEY) !== 'true') return null;
    return rotationScheduler.start({ db, cronExpression: resolveCronExpression(db) });
  },

  status(db: MediaDb): RotationSchedulerStatus {
    return {
      isRunning: state !== null,
      isCycleRunning,
      intervalMs: state?.intervalMs ?? resolveDefaultIntervalMs(),
      cronExpression: state?.cronExpression ?? resolveCronExpression(db),
      lastCycleAt,
      lastCycleError,
      nextRunAt,
    };
  },

  /** Reset all in-memory state — for tests only. */
  _reset(): void {
    state?.timer?.cancel();
    state = null;
    currentCycle = null;
    isCycleRunning = false;
    lastCycleAt = null;
    lastCycleError = null;
    nextRunAt = null;
  },
};
