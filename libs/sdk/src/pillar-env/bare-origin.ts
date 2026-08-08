/**
 * The bare-origin rule for `PillarRegistryEntry.baseUrl`.
 *
 * A base URL carrying a path, query or fragment silently breaks every consumer
 * that appends a route to it (`/health`, `/uri/resolve`, …), and the registry
 * stores whatever it is handed — so a bad value is rejected at boot rather
 * than discovered as a 404 from a sibling pillar days later.
 */

export class BareOriginParseError extends Error {
  override readonly name = 'BareOriginParseError' as const;
}

/**
 * Parse `raw` as a bare http(s) origin, returning the normalised origin with
 * any trailing slash dropped.
 *
 * @param label What `raw` came from, embedded verbatim at the head of the
 *   error message so an operator knows what to fix — an env var name
 *   (`FINANCE_SELF_BASE_URL`) or a description of the source (`pillar 'food'
 *   baseUrl`).
 * @param raw The candidate origin.
 * @throws {BareOriginParseError} If `raw` is not a URL, does not use http(s),
 *   or carries a path, query, or fragment.
 */
export function parseBareOrigin(label: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BareOriginParseError(`${label} "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BareOriginParseError(`${label} "${raw}" must use http or https; got ${url.protocol}`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    throw new BareOriginParseError(
      `${label} "${raw}" must be a bare origin (no path, query, or fragment)`
    );
  }
  return url.origin;
}
