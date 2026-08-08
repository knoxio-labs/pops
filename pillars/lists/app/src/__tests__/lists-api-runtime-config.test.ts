import { describe, expect, it } from 'vitest';

import { createClientConfig } from '../lists-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /lists-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/lists-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/lists-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3006' })).toMatchObject({
      baseUrl: '/lists-api',
    });
  });
});
