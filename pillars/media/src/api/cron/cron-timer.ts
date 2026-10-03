/**
 * Cron-driven timer primitives for the in-process schedulers.
 *
 * Split out of `rotation-scheduler.ts` so the two things that are easy to get
 * wrong — an unparseable expression stopping the engine, and `setTimeout`
 * saturating on a far-future occurrence — are stated once and tested directly.
 */
import { CronExpressionParser } from 'cron-parser';

/** `setTimeout` saturates past this and fires immediately instead. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Milliseconds until the next occurrence of `cronExpression` in the process's
 * local timezone, or `fallbackMs` when the expression cannot be parsed — a
 * corrupt setting degrades to periodic runs rather than stopping the engine.
 * Never negative, so a past occurrence cannot arm a hot loop.
 *
 * A blank expression is rejected rather than parsed: `cron-parser` reads it as
 * `* * * * *`, which would silently turn "unset" into "every minute".
 */
export function resolveArmDelayMs(cronExpression: string, fallbackMs: number): number {
  if (cronExpression.trim() === '') return fallbackMs;
  try {
    const nextAt = CronExpressionParser.parse(cronExpression).next().getTime();
    return Math.max(0, nextAt - Date.now());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[media-api] cron '${cronExpression}' is not parseable (${message}); falling back to the ${fallbackMs}ms interval`
    );
    return fallbackMs;
  }
}

/**
 * A timer can fire a few milliseconds ahead of the occurrence it was armed
 * for, which stamps that run just before the boundary. Without this margin
 * such a run would read as having missed the occurrence it actually served.
 */
const EARLY_FIRE_TOLERANCE_MS = 60_000;

/**
 * Whether an occurrence of `cronExpression` has passed with no run since
 * `lastRunMs` to serve it, so a process that was down at the scheduled time
 * can catch up on boot instead of waiting a full period. `null` (never run) is
 * always overdue. A blank or unparseable expression is judged against
 * `fallbackMs`, matching {@link resolveArmDelayMs}.
 */
export function isRunOverdue(
  cronExpression: string,
  fallbackMs: number,
  lastRunMs: number | null
): boolean {
  if (lastRunMs === null) return true;
  const previousAt = previousOccurrenceMs(cronExpression);
  return previousAt === null
    ? Date.now() - lastRunMs >= fallbackMs
    : lastRunMs < previousAt - EARLY_FIRE_TOLERANCE_MS;
}

function previousOccurrenceMs(cronExpression: string): number | null {
  if (cronExpression.trim() === '') return null;
  try {
    return CronExpressionParser.parse(cronExpression).prev().getTime();
  } catch {
    return null;
  }
}

/** A pending {@link scheduleAt} run, cancellable through every hop. */
export interface ScheduledRun {
  cancel(): void;
}

/**
 * Run `onDue` once the wall clock reaches `targetMs`, hopping in
 * {@link MAX_TIMEOUT_MS} steps when that is further out than one `setTimeout`
 * can express (a yearly cron is ~126 days away — a single timer would saturate
 * and fire straight away).
 */
export function scheduleAt(targetMs: number, onDue: () => void): ScheduledRun {
  let timer: NodeJS.Timeout;
  const step = (): void => {
    const remaining = targetMs - Date.now();
    timer =
      remaining > MAX_TIMEOUT_MS
        ? setTimeout(step, MAX_TIMEOUT_MS)
        : setTimeout(onDue, Math.max(0, remaining));
  };
  step();
  return {
    cancel(): void {
      clearTimeout(timer);
    },
  };
}
