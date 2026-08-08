import { describe, expect, it } from 'vitest';

import { createClientConfig } from './finance-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /finance-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/finance-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/finance-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3004' })).toMatchObject({
      baseUrl: '/finance-api',
    });
  });
});
