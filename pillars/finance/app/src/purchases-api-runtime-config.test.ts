import { describe, expect, it } from 'vitest';

import { createClientConfig } from './purchases-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /purchases-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/purchases-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/purchases-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3013' })).toMatchObject({
      baseUrl: '/purchases-api',
    });
  });
});
