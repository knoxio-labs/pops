import { describe, expect, it, vi } from 'vitest';

import { createRemoteEntryRevalidator } from './revalidate-remote-entry';

describe('createRemoteEntryRevalidator', () => {
  it('forces a conditional request rather than reading the cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    await createRemoteEntryRevalidator(fetchImpl)('/finance-ui/finance.js');

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('/finance-ui/finance.js', {
      cache: 'no-cache',
      credentials: 'same-origin',
    });
  });

  it('shares one request between the preload and the import of the same URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('export {}'));
    const revalidate = createRemoteEntryRevalidator(fetchImpl);

    const first = revalidate('/finance-ui/finance.js');
    const second = revalidate('/finance-ui/finance.js');

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('revalidates each distinct URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('export {}'));
    const revalidate = createRemoteEntryRevalidator(fetchImpl);

    await Promise.all([revalidate('/finance-ui/finance.js'), revalidate('/media-ui/media.js')]);

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/finance-ui/finance.js',
      '/media-ui/media.js',
    ]);
  });

  it('resolves when the request fails, so the import still runs and reports it', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    await expect(createRemoteEntryRevalidator(fetchImpl)('/media-ui/media.js')).resolves.toBe(
      undefined
    );
  });

  it('resolves on an error status, which the import is left to surface', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    await expect(createRemoteEntryRevalidator(fetchImpl)('/media-ui/media.js')).resolves.toBe(
      undefined
    );
  });
});
