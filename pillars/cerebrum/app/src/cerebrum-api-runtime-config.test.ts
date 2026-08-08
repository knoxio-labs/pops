import { describe, expect, it } from 'vitest';

import { createClientConfig } from './cerebrum-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /cerebrum-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/cerebrum-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/cerebrum-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3007' })).toMatchObject({
      baseUrl: '/cerebrum-api',
    });
  });
});
