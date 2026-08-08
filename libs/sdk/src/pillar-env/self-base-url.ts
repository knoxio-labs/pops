/**
 * Resolution of the origin a pillar advertises to the registry as its own
 * `PillarRegistryEntry.baseUrl`.
 */

import { parseBareOrigin } from './bare-origin.js';

export interface ResolveSelfBaseUrlOptions {
  /** Env var holding the advertised origin, e.g. `FINANCE_SELF_BASE_URL`. */
  readonly envVar: string;
  /** Port the process listens on, used for the loopback fallback. */
  readonly port: number;
  /**
   * Process name for the error prefix, e.g. `finance-api`. Not derived from
   * the pillar id — the registry pillar boots as `core-api` and the
   * orchestrator as `orchestrator`.
   */
  readonly processLabel: string;
  /** Environment to read. Defaults to `process.env`; injected by tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Resolve the advertised origin from `envVar`, falling back to the loopback
 * origin for `port` when unset.
 *
 * Crashes boot on a malformed value rather than registering it: the registry
 * stores what it is handed, so an invalid `baseUrl` becomes every other
 * pillar's 404 rather than this pillar's startup failure.
 *
 * @throws {Error} Wrapping a {@link BareOriginParseError}, prefixed with
 *   `processLabel` so the failing process is named alongside the env var.
 */
export function resolveSelfBaseUrl(options: ResolveSelfBaseUrlOptions): string {
  const { envVar, port, processLabel, env = process.env } = options;
  const raw = env[envVar] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin(envVar, raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[${processLabel}] ${message}`, { cause: err });
  }
}
