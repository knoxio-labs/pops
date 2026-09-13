/**
 * Fetch a loader-mounted pillar's bundle during boot instead of on first
 * navigation to it.
 *
 * A pillar the shell mounts through the runtime loader is a lazy `import()`
 * behind `<Suspense>`, so the request for its entry cannot be issued until the
 * shell has booted AND the reader has navigated to it. Measured on the
 * production build, that put the entry at 120ms and its page chunk at 140ms,
 * where a pillar compiled into the shell — as all of them were before
 * POPS-3215 — was already in the boot graph and done at 49ms. That comparison
 * is the cost of the epic, and this module is what pays it back. The delay is
 * not the bytes — the purchases entry is under a
 * kilobyte — it is that the round trip is serialised behind a decision the
 * reader has just made and is waiting on.
 *
 * The shell does not have to wait for that decision: the rail comes off the
 * wire, so every mounted pillar's `assetsBaseUrl` is known before first paint.
 * Revalidating each one moves the fetch into the boot window, in parallel with
 * the shell's own chunks, and leaves evaluation exactly where it was — the
 * module is still only evaluated when the route renders.
 *
 * This used to be a `<link rel="modulepreload">`. That reads the entry from the
 * HTTP cache without revalidating it and pins the result in the document's
 * module map, so a copy cached before a deploy was the one every later
 * `import()` got, naming chunks the deploy had deleted. The request is now the
 * same `no-cache` revalidation the importer awaits (`revalidate-remote-entry`),
 * shared rather than repeated.
 *
 * What this does NOT collapse is the second hop. A page's chunk is reached by
 * a dynamic `import()` inside the remote bundle, so it is not part of the
 * entry's static graph and nothing the shell can issue from the manifest
 * covers it. Closing that would need the remote build to publish a
 * slot → chunk map, which is a wire-contract change and not this one.
 */

import { revalidateRemoteEntry, type RemoteEntryRevalidator } from './revalidate-remote-entry';

/**
 * Start revalidating each bundle URL. Does not wait for the requests.
 *
 * A URL already revalidated in this document is not requested again: the
 * revalidator hands back its existing promise.
 *
 * @param urls Bundle URLs to fetch; duplicates and empties are ignored.
 * @param revalidate The revalidator; the document-wide one by default.
 * @returns The distinct, non-empty URLs handed to the revalidator, in order.
 */
export function preloadRemoteBundles(
  urls: readonly string[],
  revalidate: RemoteEntryRevalidator = revalidateRemoteEntry
): readonly string[] {
  const requested: string[] = [];
  for (const url of urls) {
    if (url === '' || requested.includes(url)) continue;
    void revalidate(url);
    requested.push(url);
  }
  return requested;
}
