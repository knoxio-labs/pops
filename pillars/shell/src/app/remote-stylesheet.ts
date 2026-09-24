/**
 * Linking a loader-mounted pillar's stylesheet into the shell's document.
 *
 * The shell's own sheet carries the theme and the kit's utilities and nothing
 * of any pillar's (POPS-4581). Each pillar's remote build emits the utilities
 * its own source uses as `<pillar>.css` beside its bundle, and advertises it as
 * `stylesheetUrl`; this installs it the first time the pillar's bundle is
 * loaded, so a class the shell has never seen still renders styled.
 */
import { entryUrlForThisLoad } from './remote-entry-url';

const settled = new WeakMap<HTMLLinkElement, Promise<void>>();

function linkFor(doc: Document, href: string): HTMLLinkElement | undefined {
  for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (link.getAttribute('href') === href) return link;
  }
  return undefined;
}

/**
 * Link `url` as a stylesheet, once per document load, and settle when the
 * browser has finished with it — loaded or failed.
 *
 * Idempotent by inspection, like the bundle preload: a second call for the
 * same pillar finds the `<link>` the first one added and waits on the same
 * outcome rather than adding another.
 *
 * Never rejects. A sheet that 404s leaves the pillar mounting unstyled rather
 * than not mounting at all; the shell has no better page to show in its
 * place, and a warning names the URL.
 *
 * The href is the per-load URL the entry uses (`remote-entry-url.ts`): the
 * name is stable across deploys, and an edge cache holding an earlier copy
 * would serve a sheet missing whatever classes the new bundle added.
 *
 * @param url The pillar's advertised `stylesheetUrl`.
 * @param doc Document to link into, injectable for tests.
 * @returns Resolves once the sheet has loaded or failed to.
 */
export function installRemoteStylesheet(url: string, doc: Document = document): Promise<void> {
  const href = entryUrlForThisLoad(url);
  const existing = linkFor(doc, href);
  if (existing !== undefined) return settled.get(existing) ?? Promise.resolve();

  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  const outcome = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener(
      'error',
      () => {
        console.warn(`[external-ui] pillar stylesheet failed to load: ${url}`);
        resolve();
      },
      { once: true }
    );
  });
  settled.set(link, outcome);
  doc.head.append(link);
  return outcome;
}
