/**
 * Make the browser confirm a pillar's entry bundle with the server before the
 * shell imports it.
 *
 * A pillar's entry (`/finance-ui/finance.js`) keeps its name across deploys and
 * is served `no-cache`, but that header does not reliably reach the module
 * loader: Safari has been observed importing a stale copy straight from its
 * cache, never asking the origin, after a deploy deleted every chunk that copy
 * names. The page then fails on the first lazy screen and a reload repeats it.
 *
 * A `fetch` with `cache: 'no-cache'` forces a conditional request and writes
 * the answer back into the HTTP cache, so the `import()` that follows reads
 * the current build. An unchanged entry costs a bodyless 304.
 */

type Fetch = (input: string, init: RequestInit) => Promise<unknown>;

/** Revalidates a URL at most once per document; see `createRemoteEntryRevalidator`. */
export type RemoteEntryRevalidator = (url: string) => Promise<void>;

/**
 * Build a revalidator that issues one `no-cache` request per URL and hands
 * every later caller the same promise, so the boot-time preload and the
 * route's import share a single request.
 *
 * The promise never rejects. Revalidation is an optimisation over the cache,
 * not the load: when it fails (offline, a `file:` URL, a 502) the import that
 * follows still runs and reports the real failure to the error boundary.
 *
 * @param fetchImpl The fetch to use; the global one by default.
 */
export function createRemoteEntryRevalidator(
  fetchImpl: Fetch = (input, init) => fetch(input, init)
): RemoteEntryRevalidator {
  const inFlight = new Map<string, Promise<void>>();
  return (url) => {
    const existing = inFlight.get(url);
    if (existing !== undefined) return existing;
    const request = fetchImpl(url, { cache: 'no-cache', credentials: 'same-origin' }).then(
      () => undefined,
      () => undefined
    );
    inFlight.set(url, request);
    return request;
  };
}

/** The document-wide revalidator the shell's preload and importer share. */
export const revalidateRemoteEntry: RemoteEntryRevalidator = createRemoteEntryRevalidator();
