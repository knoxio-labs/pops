import { beforeEach, describe, expect, it, vi } from 'vitest';

import { preloadRemoteBundles } from './preload-remote-bundles';
import { createRemoteEntryRevalidator } from './revalidate-remote-entry';

describe('preloadRemoteBundles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('revalidates one request per bundle URL', () => {
    const revalidate = vi.fn().mockResolvedValue(undefined);
    preloadRemoteBundles(['/purchases-ui/purchases.js', '/lists-ui/lists.js'], revalidate);
    expect(revalidate.mock.calls.map(([url]) => url)).toEqual([
      '/purchases-ui/purchases.js',
      '/lists-ui/lists.js',
    ]);
  });

  // A modulepreload reads the entry from the HTTP cache without revalidating
  // it and pins that copy in the module map for every later import().
  it('emits no modulepreload link', () => {
    preloadRemoteBundles(['/finance-ui/finance.js'], vi.fn().mockResolvedValue(undefined));
    expect(document.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0);
  });

  it('requests nothing when no pillar is loader-mounted', () => {
    const revalidate = vi.fn().mockResolvedValue(undefined);
    expect(preloadRemoteBundles([], revalidate)).toEqual([]);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('requests a repeated URL within one call only once', () => {
    const revalidate = vi.fn().mockResolvedValue(undefined);
    expect(preloadRemoteBundles(['/x.js', '/x.js'], revalidate)).toEqual(['/x.js']);
    expect(revalidate).toHaveBeenCalledOnce();
  });

  it('ignores an empty URL rather than fetching the document itself', () => {
    const revalidate = vi.fn().mockResolvedValue(undefined);
    expect(preloadRemoteBundles([''], revalidate)).toEqual([]);
    expect(revalidate).not.toHaveBeenCalled();
  });

  // Boot can run more than once (a registry retry); the network must not see
  // a second request for an entry this document already revalidated.
  it('does not issue a second network request when boot runs again', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('export {}'));
    const revalidate = createRemoteEntryRevalidator(fetchImpl);

    preloadRemoteBundles(['/purchases-ui/purchases.js'], revalidate);
    preloadRemoteBundles(['/purchases-ui/purchases.js', '/lists-ui/lists.js'], revalidate);
    await Promise.resolve();

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/purchases-ui/purchases.js',
      '/lists-ui/lists.js',
    ]);
  });

  it('does not throw when a revalidation rejects', () => {
    const revalidate = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    expect(() => preloadRemoteBundles(['/media-ui/media.js'], revalidate)).not.toThrow();
  });
});
