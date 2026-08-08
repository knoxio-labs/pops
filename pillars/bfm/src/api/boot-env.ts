/**
 * Every environment variable `server.ts` reads at boot, and the validation
 * each one gets. They live here rather than inline in the entrypoint so the
 * decisions are testable in-process: `server.ts` binds a port and installs
 * signal handlers the moment it is imported, so anything left in it can only
 * be exercised by spawning a child.
 *
 * The bias throughout is to crash at boot. A pillar that starts with a
 * misconfigured value and registers it is discovered days later as a 404 from
 * a sibling; one that refuses to start is discovered immediately.
 *
 * The bare-origin rule below is re-implemented in every pillar's
 * `src/api/pillars/env.ts` rather than shared through the SDK — this copy
 * keeps bfm's boot behaviour identical to the rest of the fleet.
 */
export const DEFAULT_PORT = 3014;

export class BootEnvError extends Error {
  override readonly name = 'BootEnvError' as const;
}

/**
 * Resolve the listen port from `PORT`, defaulting to {@link DEFAULT_PORT}.
 *
 * Rejects anything outside 1-65535 and anything non-integer, including the
 * values `Number` would otherwise accept silently — `'3014.5'`, `'0x1'`,
 * `' '` (which coerces to 0), and `''`/absent (which take the default).
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new BootEnvError(`[bfm-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

/**
 * Whether to self-register with the `registry` pillar.
 *
 * Opt-in on the exact string `true`: registration is a side effect on shared
 * fleet state, so a typo'd or half-set value must mean "no" rather than
 * "probably yes". Matches the gate every other pillar's entrypoint uses.
 */
export function shouldSelfRegister(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['POPS_REGISTRY_ENABLED'] === 'true';
}

/**
 * The build identifier reported on `/health` and carried in the manifest.
 *
 * Returned verbatim. `bootstrapPillar` coerces a non-semver value to
 * `0.0.0-sha.<short>` for the manifest only, so the default `dev` build
 * registers as `0.0.0-sha.dev` while `/health` still says `dev` — see the
 * pillar README.
 */
export function resolveVersion(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env['BUILD_VERSION'];
  return raw === undefined || raw === '' ? 'dev' : raw;
}

/**
 * Parse `raw` as a bare http(s) origin, returning the normalised origin.
 *
 * @param label Env var name, embedded in the error so an operator knows which
 *   variable to fix.
 */
export function parseBareOrigin(label: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BootEnvError(`${label} "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BootEnvError(`${label} "${raw}" must use http or https; got ${url.protocol}`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    throw new BootEnvError(`${label} "${raw}" must be a bare origin (no path, query, or fragment)`);
  }
  return url.origin;
}

/**
 * Resolve `BFM_SELF_BASE_URL`, falling back to the loopback origin for the
 * port the process is listening on.
 */
export function resolveSelfBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env['BFM_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('BFM_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[bfm-api] ${message}`, { cause: err });
  }
}
