/**
 * Durable repeatable schedules for pillar queues.
 *
 * A BullMQ job scheduler lives in Redis under a caller-chosen id, so the
 * schedule outlives the process that registered it — which is the whole point
 * of preferring one over a `setInterval` loop that restarts from zero on every
 * deploy.
 *
 * The unit of work here is RECONCILIATION, not registration: a pillar declares
 * the set of schedules it wants and the set of ids it manages, and this module
 * computes the difference against what Redis already holds. That makes boot
 * idempotent (re-registering an unchanged schedule is a no-op rather than a
 * second copy), makes a cadence change a replace-in-place, and removes the
 * schedule of a job whose feature gate has since been turned off — the case
 * that otherwise leaves an orphan firing forever with nothing listening.
 *
 * `planScheduleReconciliation` is pure so that all of that is testable without
 * Redis; `reconcileJobSchedules` is the thin executor.
 * `src/__tests__/scheduler.live-seam.test.ts` proves the durability claim
 * against a real Redis across a simulated restart.
 */
import type { ExistingSchedule, ScheduleCadence, SchedulerQueuePort } from './ports.js';

/** One schedule a pillar wants registered. */
export interface DesiredSchedule<Data = unknown> {
  /** Stable scheduler id — the durability key. Must not change per boot. */
  readonly id: string;
  readonly cadence: ScheduleCadence;
  /** Job name each occurrence is enqueued under; what the worker switches on. */
  readonly jobName: string;
  readonly data?: Data;
}

/** The difference between what a pillar wants and what Redis holds. */
export interface SchedulePlan<Data = unknown> {
  /** Schedules to (re-)register — absent, or present with a different cadence. */
  readonly upsert: readonly DesiredSchedule<Data>[];
  /** Ids already registered with the exact cadence wanted; left untouched. */
  readonly unchanged: readonly string[];
  /** Managed ids present in Redis that are no longer wanted. */
  readonly remove: readonly string[];
}

/** Raised when a pillar declares a schedule outside the ids it manages. */
export class UnmanagedScheduleError extends Error {
  constructor(ids: readonly string[]) {
    super(`Desired schedule id(s) not declared as managed: ${ids.join(', ')}`);
    this.name = 'UnmanagedScheduleError';
  }
}

/**
 * `every` comes back from Redis as a string on some paths and a number on
 * others, so compare it numerically rather than by identity.
 */
function normaliseEvery(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseText(value: string | null | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function cadenceMatches(desired: ScheduleCadence, existing: ExistingSchedule): boolean {
  if (normaliseText(desired.tz ?? null) !== normaliseText(existing.tz)) return false;
  if (desired.every !== undefined) {
    return (
      normaliseEvery(existing.every) === desired.every && normaliseText(existing.pattern) === null
    );
  }
  return (
    normaliseText(existing.pattern) === desired.pattern && normaliseEvery(existing.every) === null
  );
}

/**
 * Computes the reconciliation plan.
 *
 * `managedIds` is the full set of ids this pillar could ever register — not
 * just the ones it wants right now. Anything outside it is another owner's
 * schedule on the same queue and is never removed; anything inside it that is
 * no longer wanted is.
 */
export function planScheduleReconciliation<Data>(input: {
  readonly desired: readonly DesiredSchedule<Data>[];
  readonly existing: readonly ExistingSchedule[];
  readonly managedIds: readonly string[];
}): SchedulePlan<Data> {
  const managed = new Set(input.managedIds);
  const unmanaged = input.desired.map((s) => s.id).filter((id) => !managed.has(id));
  if (unmanaged.length > 0) throw new UnmanagedScheduleError(unmanaged);

  const existingByKey = new Map(input.existing.map((schedule) => [schedule.key, schedule]));
  const upsert: DesiredSchedule<Data>[] = [];
  const unchanged: string[] = [];

  for (const schedule of input.desired) {
    const current = existingByKey.get(schedule.id);
    if (current !== undefined && cadenceMatches(schedule.cadence, current)) {
      unchanged.push(schedule.id);
    } else {
      upsert.push(schedule);
    }
  }

  const wanted = new Set(input.desired.map((schedule) => schedule.id));
  const remove = input.existing
    .map((schedule) => schedule.key)
    .filter((key) => managed.has(key) && !wanted.has(key));

  return { upsert, unchanged, remove };
}

/** What a reconciliation actually did, for logging. */
export interface ReconcileResult {
  readonly upserted: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
}

/**
 * Applies {@link planScheduleReconciliation} against a real queue. Removals
 * run before upserts so a rename (old id out, new id in) never leaves both
 * firing for the window between the two calls.
 */
export async function reconcileJobSchedules<Data>(
  queue: SchedulerQueuePort<Data>,
  input: {
    readonly desired: readonly DesiredSchedule<Data>[];
    readonly managedIds: readonly string[];
  }
): Promise<ReconcileResult> {
  const existing = await queue.getJobSchedulers();
  const plan = planScheduleReconciliation({ ...input, existing });

  for (const id of plan.remove) {
    await queue.removeJobScheduler(id);
  }
  for (const schedule of plan.upsert) {
    await queue.upsertJobScheduler(schedule.id, schedule.cadence, {
      name: schedule.jobName,
      ...(schedule.data === undefined ? {} : { data: schedule.data }),
    });
  }

  return {
    upserted: plan.upsert.map((schedule) => schedule.id),
    unchanged: plan.unchanged,
    removed: plan.remove,
  };
}
