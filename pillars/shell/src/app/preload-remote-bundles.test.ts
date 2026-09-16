import { beforeEach, describe, expect, it } from 'vitest';

import { preloadRemoteBundles } from './preload-remote-bundles';
import { entryUrlForThisLoad } from './remote-entry-url';

function links(): string[] {
  return [...document.head.querySelectorAll('link[rel="modulepreload"]')].map((link) =>
    link.getAttribute('href')
  ) as string[];
}

const identity = (url: string) => url;

describe('preloadRemoteBundles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('emits one modulepreload per bundle URL', () => {
    preloadRemoteBundles(['/purchases-ui/purchases.js', '/lists-ui/lists.js'], document, identity);
    expect(links()).toEqual(['/purchases-ui/purchases.js', '/lists-ui/lists.js']);
  });

  // The advertised URL keeps its name across deploys; a cache holding it
  // serves an entry whose chunks are gone. The preload must never ask for it.
  it('preloads the per-load entry URL, never the advertised one, by default', () => {
    preloadRemoteBundles(['/finance-ui/finance.js']);
    expect(links()).toEqual([entryUrlForThisLoad('/finance-ui/finance.js')]);
    expect(links()).not.toContain('/finance-ui/finance.js');
  });

  it('emits nothing when no pillar is loader-mounted', () => {
    expect(preloadRemoteBundles([], document, identity)).toEqual([]);
    expect(links()).toEqual([]);
  });

  // Boot can run more than once — a registry retry, a test — and a second
  // <link> for the same URL is a second request in some browsers.
  it('does not re-add a URL the document already carries', () => {
    preloadRemoteBundles(['/purchases-ui/purchases.js']);
    const second = preloadRemoteBundles(['/purchases-ui/purchases.js', '/lists-ui/lists.js']);

    expect(second).toEqual(['/lists-ui/lists.js']);
    expect(links()).toEqual([
      entryUrlForThisLoad('/purchases-ui/purchases.js'),
      entryUrlForThisLoad('/lists-ui/lists.js'),
    ]);
  });

  it('adds a repeated URL within one call only once', () => {
    expect(preloadRemoteBundles(['/x.js', '/x.js'], document, identity)).toEqual(['/x.js']);
    expect(links()).toEqual(['/x.js']);
  });

  it('ignores an empty URL rather than preloading the document itself', () => {
    expect(preloadRemoteBundles([''])).toEqual([]);
    expect(links()).toEqual([]);
  });

  it('leaves unrelated head links alone', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = '/icons/icon-192.png';
    document.head.append(icon);

    preloadRemoteBundles(['/purchases-ui/purchases.js'], document, identity);

    expect(links()).toEqual(['/purchases-ui/purchases.js']);
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  });

  // A quote or a backslash in the URL would end the attribute selector early
  // and throw out of the dedupe check — turning a preload into a boot failure.
  it('survives a URL carrying selector metacharacters', () => {
    const url = '/odd-ui/a"b\\c.js';
    expect(() => preloadRemoteBundles([url], document, identity)).not.toThrow();
    expect(preloadRemoteBundles([url], document, identity)).toEqual([]);
    expect(links()).toEqual([url]);
  });
});
