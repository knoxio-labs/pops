/**
 * Reconciliation cadence from the environment.
 *
 * Lives beside the worker rather than inline in `server.ts` because it is
 * logic with a failure mode, and the process entry point is the one module no
 * test covers.
 */

/** Env var a deployment (or a smoke test that cannot wait a day) overrides. */
export const RECONCILE_INTERVAL_ENV = 'INVENTORY_RECONCILE_URI_INTERVAL_MS';

/**
 * Read the optional tick interval in milliseconds.
 *
 * Absent or empty means "use the worker's daily default". Anything else must
 * be a positive finite number, and a malformed value **throws rather than
 * falling back**: an operator who wrote `…INTERVAL_MS=1h` meant something by
 * it, and silently running the daily default would look exactly like the
 * setting having worked.
 */
export function resolveReconcileIntervalMs(
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  const raw = env[RECONCILE_INTERVAL_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `[inventory-api] ${RECONCILE_INTERVAL_ENV} must be a positive number of milliseconds; got '${raw}'`
    );
  }
  return parsed;
}
