/**
 * The URL the shell actually imports a pillar's entry bundle from.
 *
 * A pillar's entry (`/finance-ui/finance.js`) keeps its name across deploys,
 * and every chunk it names is deleted by the next one. Any cache between the
 * browser and the pillar that hands back an old entry, whether the browser's
 * own or Cloudflare's edge, therefore breaks every lazy screen, and no header
 * the origin sends is honoured reliably enough to prevent it: in production
 * the edge kept serving an entry two deploys old to Safari, across reloads,
 * without the request ever reaching pops-shell.
 *
 * So the entry is never requested under a URL a cache can have seen. Each
 * document load imports it with a query no earlier load used; the document
 * itself always reaches the origin, so the entry it imports is always current.
 * The chunks the entry names keep their content-hashed URLs and stay cacheable.
 * The cost is one uncached entry, a few kilobytes, per pillar per page load.
 */

/** Unique per document load; shared by the boot preload and every import. */
export const DOCUMENT_LOAD_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Append `v=<loadId>` to an entry URL, keeping any existing query and fragment.
 *
 * @param url The pillar's advertised `assetsBaseUrl`.
 * @param loadId The per-load token; `DOCUMENT_LOAD_ID` by default.
 * @returns The URL to preload and import; an empty `url` is returned unchanged.
 */
export function entryUrlForThisLoad(url: string, loadId: string = DOCUMENT_LOAD_ID): string {
  if (url === '') return url;
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${encodeURIComponent(loadId)}${fragment}`;
}
