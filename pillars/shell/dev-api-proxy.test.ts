import { describe, expect, it } from 'vitest';

import { createDevApiProxy } from './dev-api-proxy.js';

describe('createDevApiProxy', () => {
  it('uses the local pillar and strips its shell prefix by default', () => {
    const proxy = createDevApiProxy(
      'http://localhost:3002',
      '/inventory-api',
      undefined,
      undefined
    );

    expect(proxy.target).toBe('http://localhost:3002');
    expect(proxy.rewrite?.('/inventory-api/items?limit=3')).toBe('/items?limit=3');
    expect(proxy.rewrite?.('/inventory-api-other/items')).toBe('/inventory-api-other/items');
    expect(proxy.headers).toBeUndefined();
  });

  it('keeps the shell prefix and attaches the Access token for a remote origin', () => {
    const proxy = createDevApiProxy(
      'http://localhost:3002',
      '/inventory-api',
      'https://pops.jmiranda.dev/',
      'short-lived-token'
    );

    expect(proxy.target).toBe('https://pops.jmiranda.dev');
    expect(proxy.rewrite).toBeUndefined();
    expect(proxy.headers).toEqual({ 'CF-Access-Token': 'short-lived-token' });
  });

  it('rejects a token without a remote origin', () => {
    expect(() =>
      createDevApiProxy('http://localhost:3002', '/inventory-api', undefined, 'short-lived-token')
    ).toThrow('POPS_DEV_ACCESS_TOKEN requires POPS_DEV_API_ORIGIN');
  });

  it.each([
    'http://pops.jmiranda.dev',
    'https://user@pops.jmiranda.dev',
    'https://pops.jmiranda.dev/inventory-api',
    'https://pops.jmiranda.dev?preview=1',
  ])('rejects a non-origin remote target: %s', (remoteOrigin) => {
    expect(() =>
      createDevApiProxy('http://localhost:3002', '/inventory-api', remoteOrigin, undefined)
    ).toThrow('POPS_DEV_API_ORIGIN must be an HTTPS origin');
  });
});
