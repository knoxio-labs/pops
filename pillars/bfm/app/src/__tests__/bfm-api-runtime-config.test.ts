import { describe, expect, it } from 'vitest';

import { createClientConfig } from '../bfm-api-runtime-config';

describe('createClientConfig', () => {
  // The shell's vite dev proxy and the production reverse proxy both key on
  // this exact path. A silent change here routes every bfm call into the
  // shell's own origin, which 404s in a way that looks like a bfm outage.
  it('points the generated client at the shell /bfm-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/bfm-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/bfm-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  // Callers override the host for e2e / storybook by wrapping the client.
  // If this spread order ever flips, that override silently stops working.
  it('lets an explicit baseUrl lose to the proxy default rather than half-applying', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3014' })).toMatchObject({
      baseUrl: '/bfm-api',
    });
  });
});
