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
 * A `modulepreload` for each one moves the fetch into the boot window, in
 * parallel with the shell's own chunks, and leaves evaluation exactly where it
 * was — the module is still only evaluated when the route renders, so nothing
 * about the lazy-mount behaviour changes.
 *
 * The preload targets the same per-load URL the importer uses
 * (`remote-entry-url.ts`), so it never reads a cached entry and the import
 * reuses the preloaded module instead of fetching again.
 *
 * What this does NOT collapse is the second hop. A page's chunk is reached by
 * a dynamic `import()` inside the remote bundle, so it is not part of the
 * entry's static graph and no preload the shell can emit from the manifest
 * covers it. Closing that would need the remote build to publish a
 * slot → chunk map, which is a wire-contract change and not this one.
 */

import { entryUrlForThisLoad } from './remote-entry-url';

const REL = 'modulepreload';

/**
 * Emit a `modulepreload` for each URL's per-load entry URL, skipping any the
 * document already has.
 *
 * Idempotent by inspection rather than by a module-level flag: boot can run
 * more than once in a test, and a `<link>` the document already carries is the
 * only reliable record of what was requested.
 *
 * @param urls Advertised bundle URLs; duplicates and empties are ignored.
 * @param doc Document to append to, injectable for tests.
 * @param toEntryUrl Maps an advertised URL to the one fetched; per-load by default.
 * @returns The advertised URLs a link was added for, in the order they were added.
 */
export function preloadRemoteBundles(
  urls: readonly string[],
  doc: Document = document,
  toEntryUrl: (url: string) => string = entryUrlForThisLoad
): readonly string[] {
  const added: string[] = [];
  for (const url of urls) {
    if (url === '') continue;
    if (added.includes(url)) continue;
    const href = toEntryUrl(url);
    if (doc.head.querySelector(`link[rel="${REL}"][href="${cssEscape(href)}"]`) !== null) continue;

    const link = doc.createElement('link');
    link.rel = REL;
    link.href = href;
    doc.head.append(link);
    added.push(url);
  }
  return added;
}

/**
 * Quote a URL for use inside an attribute selector. `CSS.escape` is the right
 * tool and is absent in some test environments, so the fallback escapes the
 * characters an `assetsBaseUrl` can actually contain — a quote or a backslash
 * would otherwise end the selector early and throw, turning a preload into a
 * boot failure.
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, String.raw`\$&`);
}
