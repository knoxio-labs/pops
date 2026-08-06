/**
 * Sweep cadence from the environment.
 *
 * Lives here rather than inline in `server.ts` because it is logic — three
 * branches and a failure mode — and the process entry point is the one
 * module no test covers. Parsing an operator's configuration is exactly the
 * kind of thing that should not be trusted to "it looked right".
 */

export interface SweepIntervals {
  readonly coalesceMs?: number;
  readonly pollMs?: number;
}

/**
 * Read an optional millisecond interval.
 *
 * Absent or empty means "use the module default". Anything else must be a
 * positive finite number, and a malformed value **throws rather than
 * falling back**: an operator who set `PURCHASES_SWEEP_POLL_MS=30s` meant
 * something by it, and silently running the 15-minute default would look
 * exactly like the setting having worked.
 */
export function optionalIntervalMs(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `[purchases-api] ${name} must be a positive number of milliseconds; got '${raw}'`
    );
  }
  return parsed;
}

/** The two cadences a deployment may override. */
export function resolveSweepIntervals(env: NodeJS.ProcessEnv = process.env): SweepIntervals {
  const coalesceMs = optionalIntervalMs('PURCHASES_SWEEP_COALESCE_MS', env);
  const pollMs = optionalIntervalMs('PURCHASES_SWEEP_POLL_MS', env);

  return {
    ...(coalesceMs === undefined ? {} : { coalesceMs }),
    ...(pollMs === undefined ? {} : { pollMs }),
  };
}
