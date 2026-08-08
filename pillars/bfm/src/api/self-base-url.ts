/**
 * Validation for the origin bfm advertises to the registry as its own
 * `PillarRegistryEntry.baseUrl`.
 *
 * A base URL carrying a path, query or fragment silently breaks every
 * consumer that appends a route to it, and the registry stores whatever it is
 * handed — so a bad value is caught at boot rather than discovered as a 404
 * from a sibling pillar days later.
 *
 * The same bare-origin rule is re-implemented in every pillar's
 * `src/api/pillars/env.ts` rather than shared through the SDK — this copy
 * keeps bfm's boot behaviour identical to the rest of the fleet.
 */
export class SelfBaseUrlError extends Error {
  override readonly name = 'SelfBaseUrlError' as const;
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
    throw new SelfBaseUrlError(`${label} "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SelfBaseUrlError(`${label} "${raw}" must use http or https; got ${url.protocol}`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    throw new SelfBaseUrlError(
      `${label} "${raw}" must be a bare origin (no path, query, or fragment)`
    );
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
